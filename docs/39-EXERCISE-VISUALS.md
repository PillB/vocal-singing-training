# 39. A picture for every exercise

Every exercise now has its own picture: a drawing, animation or small game made for
what that exercise trains. Before this, most exercises showed the same pitch highway
or a few words and a linear volume needle, whatever the skill. This document says what
each picture shows, what it measures and what it only guides, why it was designed that
way, and how to test it.

## How it was done

1. **Ran every exercise.** A synthetic singer and speaker (`qa/synthetic-voice.js`)
   replaced the microphone, and `qa/drive-exercises.mjs` drove all 47 exercises in
   real Chromium at 1280×720, 390×844 and a rotated phone (844×390), taking screenshots
   while practising and after Stop.
2. **Audited each picture** against what the exercise asks for: what the learner can
   see at a glance, what is honest, what is broken at each size. 44 of 47 needed a new
   picture and 3 needed fixes.
3. **Researched** eight topics: pitch feedback, breath, semi-occluded vocal tract (lip
   trills, straw), vowels and resonance, dynamics and onsets, speech prosody, game
   design, and perception and accessibility. See [the evidence](#how-far-to-trust-the-evidence).
4. **Built** a shared measuring kit and drawing kit, then one picture per exercise,
   family by family, each with its own synthetic voices and spec.
5. **Validated** by driving every exercise again, a blind before/after review by three
   judges per exercise, and the full test suite.

## Rules every picture follows

These come from the research and are binding for any new exercise.

- **Measure only what a microphone can measure, and say "aprox." when it is an
  estimate.** A mic hears pitch, relative level, whether the sound repeats (voiced or
  not), rough spectral balance, timing, and roughly the first two vowel formants at low
  pitch. It cannot hear breath support, airflow, "air left", placement, the mask,
  chest or head "resonance", nasality of open vowels, ease, confidence or authority.
  Those are never scored. Where nothing can be measured, the picture is a pacer or a
  guide and says so.
- **Relative to the learner, never to a norm.** Level is dB against your own median or
  your own start (read before the app's input gain), pitch is semitones or cents
  against your own median or the target, pace is syllables per second against your
  own first take.
- **One slow cue while you sing or speak; the detailed map after Stop.** Reading
  numbers competes with planning speech and with listening to yourself. Events too fast
  to correct in the moment (onsets, staccato attacks, pauses, fillers) get feedback
  after each one, not a live meter.
- **Honest metrics.** Stop fills in only what was measured. Self-ratings (ease,
  clarity, vividness, authority, openness, comfort…) stay with the learner and are
  never filled in from counts or elapsed time.
- **Describe, don't judge.** Nothing turns red for a long pause, a filler, a hard onset
  or a stall. Direction words ("más agudo", "cae", "se paró") instead of "MISS".
  Celebrations last 300 ms or less and never happen while the mic listens in a speech
  drill. Nothing withers or is taken away.
- **Colour is never the only cue.** Every state also has a position, a shape (zigzag,
  hatch, notch, glyph) or a word. Palette: you = light blue, target = green, done =
  gold, air = violet, warn = orange; checked for colour-blind distance.
- **Reduced motion pages instead of scrolling.** The data stays live.
- **Works on a rotated phone.** Every picture has a full layout, a compact one
  (under 190 px tall) and a tiny one (under 135 px), and sits in the first screen.
- **Spanish first.** Every visible word exists in Spanish and English, with a decimal
  comma in Spanish. Stored values stay English.
- **No mic for pure pacers.** An exercise that only paces (profile `showLevel:false`, no
  `showPitch`/`showHold`/`autoRecord`) never asks for the microphone.

## The shared pieces

| Piece | What it is |
|---|---|
| `js/voice-features.js` → `VTFeatures` | Measures built on the raw engine frame: `Vad` (speech and silence against the room's own floor, pauses backdated to where they began), `SyllableRate`, `TrillDetector` (trill, air trill, tone, air, silence), `Envelope` (a fast level envelope from the samples), `OnsetCapture` (rise time, overshoot, air before tone), `RelativeLevel`, `StablePitch` (median with octave-slip rejection). |
| Engine frame (`js/practice-engine.js`) | Now also carries `sounding`, `rawFreq`, `buf`, `sampleRate`, `inputGain` and `processedInput` (true when the browser applied auto gain or noise suppression, which a picture then says in one line). The older `voiced`/`voiceFreq` bridge about 1.1 s of silence, so they are never used for pauses, onsets or note lengths. |
| `js/exercise-viz.js` → `VTViz` | Canvas `Surface` (fills its box, DPR-aware, throttled `aria-live` caption), `Timeline` (a scrolling picture with the path ahead), `PhaseTrack` (step, countdown, segmented bar), painters (chips, gauge, ring, speech strip, tag strip, glyphs), the palette and `L(es, en)`. |
| `js/scenes/*.js`, `css/scenes/*.css` | One file per family: speech, speech-shape, volume, guided, breath, pitch, dynamics, resonance. |
| Pitch highway (`js/pitch-visualizer.js`) | Overlay hooks for pictures drawn on the highway: `setOverlay`, `setNoteQueue` (the notes ahead), `setQueueProgress`, `setDisplay`, `geo.safeTop` / `geo.safeBottom`; paging under reduced motion. Defaults draw the highway as before. |
| Pitch game (`js/pitch-game.js`) | Counts time, not frames (a 120 Hz screen used to score twice as fast), reads the centre of a vibrato rather than its peaks, and ends a streak only after 200 ms off the note. |
| Recorder (`js/recorder.js`) | Records takes without auto gain or noise suppression, so a swell or a soft onset sounds on playback as it was sung. |
| Piano (`js/piano.js`) | `isSounding()` says whether a reference note is ringing now, so drills don't count the speakers as the learner's voice. |

## Exercise by exercise

"Measured" is what the mic reads; "guided" is timing or steps the picture leads you
through; "fills in" is what Stop writes to the session's metrics.

### Speaking: timing

| Exercise | Picture | Measured | Guided | Fills in |
|---|---|---|---|---|
| v1 Mejor dicción | A staircase of four pace rungs. Rung 1 measures your own comfortable, over-articulated pace as 100 %; one slowly eased dot shows where you sit on the current rung. After Stop, the pace you read at on each rung and your phrase length between breaths. | Syllable rate (aprox.), speech and pause runs | Rung targets | duration (20 s or more) |
| v10 Pausa medida | A gauge that grows while you are silent, with the 1–3 s "pausa de poder" band; your last pauses as bars; speech and silence over the last 20 s; three takes side by side after Stop. | Pause lengths | The three takes | pause count |
| v11 Eliminar rellenos | Three rounds. A ring fills as a silence grows long enough to replace a filler; your taps and possible hesitation sounds (hollow ○, aprox.) sit on a strip; one row per round after Stop. | Silences, a hesitation hint (voiced, one pitch, flat, 0.4–1.6 s) | Taps for fillers caught and pauses made | fewest taps in a 20 s round |
| v14 Variar el ritmo | A pace river against your own base band from take 1; "Punto clave" raises a flag that becomes an anchor if you slowed or paused within 5 s. | Pace against your base, pauses | Which moments are key points | most anchors in a take |
| v8 Metáforas | A topic card with the frame "… es como ___ porque ___", a fluency ribbon of speech and silence, the time to the first word, stars for metaphors you mark. | First-word time, gaps | Topics, metaphor taps | metaphors marked |
| v6 Conectar | Two lanes on a clock, "tú" and "ellos". Their turn becomes "✓ en silencio" if you stayed quiet; overlap is hatched, not red. Talk share against a 30 % tick. | Talk time, overlap, longest turn | Scripted turns | nothing (presence stays yours) |
| v3 Paladar blando | 60 beads; each spoken number fills one; a pacer ring on the next bead; a mouth card marked "ilustrativo". | Numbers as voice bursts, spacing | Posture, beat | count reached |

### Speaking: shape and structure

| Exercise | Picture | Measured | Guided | Fills in |
|---|---|---|---|---|
| v12 Habla melódica | Each phrase as a pitch line in semitones against your usual pitch, pauses squeezed out; each ending gets ↘ / → / ↗; your range against the flat baseline take. Four takes. No note highway (pitch is not the skill). | Contour and range (aprox.) | The four takes | nothing |
| v19 Cierre con autoridad | A slot per claim: the sentence's line against its own middle, the ending ("cae", "sube · suena a pregunta"), a ring over the 1 s silence after it, "¿etiqueta?" for a tag. | Final fall or rise, the silence after (aprox.) | Claims, retries | landed claims |
| v17 Concisión | A door that opens after 2.5 s of silence before you answer, then the answer as speech blocks against a 20–30 s guide band. | Silence before, answer length, pauses | Questions | questions answered |
| v18 Pico de la historia | Context / tension / peak / lesson as a bar sized by time, your loudness band under it on the same axis, "⚑ Marcar pico". After Stop, the peak against the context in dB, pace and pauses. | Level, pace, pauses (aprox.) | The four parts | nothing |

### Speaking: volume

| Exercise | Picture | Measured | Guided | Fills in |
|---|---|---|---|---|
| v2 Volumen parejo | A ribbon of each breath's syllable peaks against your own level with a ±3 dB band; each breath ends with "pareja / cae / sube"; cards per breath; a blind round. | Level per syllable in dB | Counting | breaths of 3 s or more |
| v13 Escalera de volumen | One tread per step (1→5, back 5→3→1); a tread shows "▲ +5 dB" when it moved at least 3 dB the way asked; then a 60 s story with five zones from your own ladder. | Level per step | The ladder, the story | complete ladders |
| v20 Iguala la energía | Three small charts, volume, pace and melody, with a dot per take (low, medium, high, lead). Small changes are dashed "≈ casi igual". | Level, pace (aprox.), pitch range | The takes | nothing |

### Guided drills

Every guided picture shows the step you are on, the next one, a ring with the time
left and a bar of all the steps; any step can be skipped. Recorded drills turn into a
listen-back after Stop: a list of parts, each with its own speech strip, and a tap plays
it. Drawings that guide rather than measure say so ("Dibujo guía, no una medida").

| Exercise | Picture | Measured | Guided | Fills in |
|---|---|---|---|---|
| v4 Articulación con bolígrafo | The count on the beat: the current number large, a beat ball, the pen drawn in or out. 90 s counting 1–60 with the pen, 5 s to take it out, 30 s counting 1–20 without. After Stop: "A · con bolígrafo", "B · sin bolígrafo" and "A y luego B" played back to back. | Nothing scored (clarity stays self-rated) | Beat, steps | nothing |
| v5 Oídos neutros | Four persona cards (Motivador, Coach, Amigo, Educador) with an icon and intent each, then a story arc (planteamiento, giro, punto). After Stop, one part per card and "La historia entera". | Nothing scored | Cards, arc | nothing |
| v7 Grabar y revisar | The take as wrapped rows, one bar per second of voice against the room, silences as gaps, pauses of 2 s or more marked, gold lines at the 5:00 minimum and the 10:00 end. A topic card with "Otro tema". After Stop, the take cut by minute and "Revísala desde mañana …: Oído → Vista → Transcripción". | Voice level per second, pauses | Topic, the review plan | nothing |
| v9 Plan de 12 semanas | Opens the Plan view: the week's seven days (gold check for your focus, blue ring for other practice, dashed ahead, "hoy" ringed), "N de 7 días con tu foco", the twelve weeks as a staircase, and the next action. | Days practised | The plan | nothing |
| v15 Gestos | A drawn figure moving through each pose (frame, base, palms, size, count, place), timed to a starred key word in the script line. No camera; the old tap counters are gone. | Nothing | Poses, script | nothing |
| v16 Expresión facial | A drawn face per step (rest, warm hello, curiosity, surprise, resolve) with the script line; the next face is announced 3 s early. The review asks you to watch the video muted first. | Nothing | Faces, script | nothing |
| s17 Soltar mandíbula y cuello | A pacer with the mic closed: jaw hangs, neck half-circles (never rolling the head back), a chewing hum and yawn slots, with "Sin prisa…". | Nothing | The whole drill | steps done |
| s19 Paladar blando | Two silent steps (surprise face, the pre-yawn "capilla"), with "Se oye sonido · este paso va sin voz" if it hears sound. Then a reference C3 that is not counted as you, hold bars against a 1.5 s line, and a closed-then-open phrase pair. After Stop: "Abierta frente a cerrada (aprox.): nivel ±x dB · tono ±y cents", and "Más espacio ≠ más volumen" when the open one is 3 dB or more louder. | Holds, level and pitch of the pair | Silent steps, the pair | holds of 1.5 s or more (openness stays self-rated) |

### Breath and semi-occluded (lip trills, straw)

| Exercise | Picture | Measured | Guided | Fills in |
|---|---|---|---|---|
| s4 Trinos de labios | A scrolling ribbon: a light-blue zigzag while the lips bubble with voice, violet on the floor for a voiceless brrr, a flat line with a notch and "se paró" when the bubbling stops. Piano notes ahead as dashed lines. | Lip flutter, pitch, sound | Steps, piano targets | duration (30 s or more of flow) |
| s6 Pajita | The same ribbon: tone as a bar at its pitch, air with no tone as violet dots. | Tone, air, flow | Steps | minutes (30 s or more) |
| s27 Trino con solfeo | On the highway, a bubble strip and the scale's notes ahead (DO RE MI FA SOL); below, a map of stones, one per syllable: zigzag = trilled, notch = stalled. | Trill state, pitch | The scale | patterns |
| s15 Escalera de SH | A violet bar that grows with the SH towards a flag, a level line with a ±3 dB band (aprox.), breaks cut out as "hueco", an 8 s rest countdown. | Air-noise duration and steadiness | Rungs | rungs, longest SH |
| s8 Apoyo respiratorio | Two lanes of seconds, S (violet) then /A/ (light blue), with your best S marked in the /A/ lane. No red, no warning. | Durations of S and /A/ | The switch | longest S |
| s18 Respiración costal | A 4–2–8 breathing wave with a dashed "ribs" line and the phases ahead. A pacer: the mic stays closed and the picture says the mic cannot see the ribs. | Nothing | The whole drill | nothing |

### Pitch

| Exercise | Picture | Measured | Guided | Fills in |
|---|---|---|---|---|
| s5 Sirenas | Free range: your line, a range bar per siren, register jumps and short cuts marked with words. Above ~400 Hz a reading an octave low is folded back and marked "aprox." | Range, breaks | Nothing fixed | sirens |
| s1 Fry → /A/ | Creak versus clear tone live; a 2 s bar for the current clear hold; a shelf of recent holds. | Creak or clear, hold length | Steps | longest clear hold |
| s7 Resonancia con hum | Ten soft targets as stones on their lanes, the next ones waiting to the right; a stone locks after 1.5 s within ±45 ¢. | Pitch | The targets | targets |
| s9 Afinar una nota | Listen first (1.8 s, nothing scored), then sing; chips show each note with its offset; an octave away counts. | Pitch offset | Rounds | matches, accuracy (3 or more) |
| s10 / s16 Escalas | Degrees lock in order within ±40 ¢, each leaving a check with its cents; a chip row shows the path. After Stop: median offset, sharp or flat tendency, furthest degrees. | Pitch per degree | The scale | roots, intonation (s16) |
| s2 / s13 Acordes y arpegios | The note the piano plays is a stone that lands when held; arpeggio intervals linked with their error. | Pitch, intervals | The chords | reps, passes, interval accuracy |
| s3 Estrofas | Phrase lengths as brackets against a goal you pick, each phrase's level shape ("parejo / crece / cae"), stanza buttons for how it felt. | Phrase length, level shape | Goal | only what you tap |

### Dynamics, onset and articulation

| Exercise | Picture | Measured | Guided | Fills in |
|---|---|---|---|---|
| s11 Dinámica | Your level in dB against your own soft start, drawn over a hairpin guide ahead of now; below it, pitch in cents against the note you started on. One card per swell after Stop. | Level shape, pitch through the swell | The hairpin | swells, pitch steadiness at the peak |
| s12 Ataque suave | After six examples of your own (abrupt, breathy, easy), each onset gets a card of its first 300 ms: air before the tone, rise, overshoot. Named by the nearest of your examples. Feedback after each onset, not a live meter. | Rise, overshoot, air before tone | The examples | easy onsets |
| s14 Staccato y legato | A roll of note pills in time at their pitch; staccato pills show their length, legato steps are joined; "corte" and "deslizado" are marked. After Stop, a note-length chart that shows the two clusters. | Note lengths, gaps, steps | Phases | rounds |

### Vowels and resonance

| Exercise | Picture | Measured | Guided | Fills in |
|---|---|---|---|---|
| s20 Cinco vocales | One page per round: five columns I E A O U with your trace against the note band, cents and dB per vowel, and an approximate vowel map (F1/F2). | Pitch and level per vowel; vowel shape (aprox.) | The vowel clock | rounds |
| s21 Graves con cuerpo | A zone lane with targets; beside it your level against your mean and an approximate clarity gauge. | Pitch, level, clarity (aprox.) | Targets | targets held |
| s22 Voz media | Spoken turns build your speaking band; sung turns are compared with it (pitch, level, brightness). | Pitch, level, brightness (aprox.) | Turns | targets held, pitch steadiness |
| s23 «YA» | Brightness against loudness in a 2D plot, with "más fuerte, no más brillante" when only the level rose. The mask is felt; the screen shows brightness. | Brightness (aprox.), level | Phases | targets held |
| s24 Agudos suaves | A gauge of level against the volume you started with, a card per note. | Level against your start, pitch | Targets | targets held, steadiness at soft volume |
| s25 Recorrido de zonas | A zone timeline, a pass counter, and a card per seam with the level change across it. | Pitch, level across seams | The tour | targets held |
| s26 Comparar colocación | Two take lanes, A "tal cual" and B "colocada", then facts: key, volume, melody, duration, brightness and an approximate spectrum. Play both, level-matched. You judge how each felt. | Everything in the facts | The two takes | takes |

## Testing

- **Specs.** One per family, `tests/exercise-viz*.spec.js`, run with the synthetic
  voice (`tests/helpers/voice.js`): the picture is drawn and in the first screen, the
  key measured behaviour works (a trill counted, a dropout shown, a pause measured),
  English labels, and Stop leaves a review.
- **Voices.** `qa/voices/<family>.js` add failure cases with `__VTVoice.define(name, fn)`:
  a trill that stalls, a flat ladder, a sharp swell, a breathy onset, fillers.
- **Driving every exercise.**
  `CHROME_PATH=… OUT=… node qa/drive-exercises.mjs` (env `IDS`, `VIEWPORTS`, `SECS`,
  `SCENARIO`) saves screenshots at three moments and after Stop, for each size.

## What the synthetic voice cannot tell us

The synthetic voice checks that each picture reacts correctly to the sound it is
built to see. It does not check that real voices produce that sound. These need real
recordings before any threshold is tightened:

- syllable-rate accuracy on real speech (peak counting is roughly ±15–20 %), and
  Spanish numbers that split into several bursts;
- whether real "eee" / "mmm" hesitations separate from held vowels;
- real lip-flutter depth, how sharp a real trill reads, and a dark SH near 2 kHz;
- real creak versus a breathy onset, and subtle aspiration;
- vowel formants on higher voices and in noisy rooms;
- what real auto gain and noise suppression do to level steps and air sounds (the
  pictures only react to the browser's settings flag);
- the piano reaching the mic through speakers (drills now ignore a ringing reference
  note, but a backing loop still reaches the mic, so headphones are suggested);
- behaviour when frames arrive late on a slow phone (onsets and short gaps).

## How far to trust the evidence

The physics, physiology and perception facts behind these rules are solid: poor
pitch singing is mostly a vocal-motor problem; vibrato spans about ±50–100 cents and is
heard at its centre; level drops about 6 dB each time the distance to the mic doubles;
formant estimates fail at high pitch; "chest" and "head" are registers, not places
where sound resonates. What is weak is every claim that a visual display leads to
lasting improvement: studies of real-time visual feedback for singing are small, short
and rarely test retention, and the classic advice to fade feedback shrinks to near
zero in a bias-corrected meta-analysis. So these pictures aim to make the task clear
and the direction of an error obvious, and to stay out of the ear's way; they do not
promise that watching them teaches.

The research was done with web searches that returned titles and links but not the
papers' text, so no finding was read in full here. These are the main sources; the
figures quoted above are from background knowledge and should be checked against the
papers before being cited elsewhere.

- Hoppe, Sadakata & Desain 2006, review of real-time visual feedback in music
  education.
- Lã & Fiuza 2022, real-time visual feedback in singing pedagogy (Applied Sciences).
- Wilson, Lee, Callaghan & Thorpe 2008, learning to sing in tune with visual feedback.
- McKay et al. 2022, meta-analysis of reduced feedback frequency.
- Sigrist et al. 2013, review of augmented feedback in motor learning.
- Pfordresher & Brown 2007; Berglin, Pfordresher & Demorest 2022 (poor-pitch singing).
- Titze 2006 and later work on semi-occluded vocal tract exercises.
- Švec & Granqvist 2018, sound level measurement guidelines.
- Repp 2005 and Hove et al. 2013 on timing to sounds versus flashes.
- WCAG 2.2 success criteria 1.3.3, 1.4.1, 1.4.11, 2.2.2, 2.3.1 and 2.5.8.
