/**
 * Enhanced exercise library — Vocal (Vinh Giang) + Singing (Live Music School)
 * Source spirit: Vocal training and Singing training Homework.md
 */
window.VT_EXERCISES = {
  vocal: [
    {
      id: "v1-diction",
      track: "vocal",
      number: 1,
      title: "Better Diction",
      durationMin: 5,
      original:
        "Grab a book, rote-read the same page for 5 minutes. Overdo mouth movements. Rates of speech: 5, 6, 7, 8.",
      steps: [
        "Pick a short page from any book or article.",
        "Read the same page for 5 minutes total — do not switch pages.",
        "Over-articulate: exaggerate lips, jaw, and tongue (cartoon-clear).",
        "Cycle rates: 5 (comfortable) → 6 → 7 → 8 (challenge), about 1 minute each, then free mix.",
        "Optional: record 30 seconds at the start and end to compare clarity."
      ],
      tips: [
        "Exaggeration builds range; normal speech will feel clearer afterward.",
        "Keep the jaw free — tension kills diction.",
        "At higher rates, protect consonants (especially t, d, k, g).",
        "Breathe at phrase ends; never sacrifice breath for speed."
      ],
      mistakes: [
        "Changing pages (breaks muscle memory).",
        "Only moving lips, not the tongue tip.",
        "Mumbling when rate increases."
      ],
      metrics: [
        { id: "duration", label: "Minutes practiced", type: "number", target: 5, unit: "min" },
        { id: "clarity", label: "Clarity (self)", type: "scale", min: 1, max: 5 },
        { id: "rateControl", label: "Rate control", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 300
    },
    {
      id: "v2-volume",
      track: "vocal",
      number: 2,
      title: "Maintain Volume",
      durationMin: 5,
      original:
        "Count from 1 to 10 keeping the same energy throughout, until you naturally run out of breath.",
      steps: [
        "Inhale comfortably (not a huge gasp).",
        "Count 1 to 10 at one steady energy and volume — no fade at 8–10, no blast at 1.",
        "Continue sets until breath runs out naturally; rest; repeat for about 5 minutes.",
        "Imagine speaking to the same point on the wall each time."
      ],
      tips: [
        "Steady support from the body, not throat push.",
        "If you fade, start slightly softer so you can finish even.",
        "Stop if you feel strain — this is control, not volume contests."
      ],
      mistakes: ["Trailing off at the end", "Starting too loud", "Holding residual air with neck tension"],
      metrics: [
        { id: "cycles", label: "Full 1–10 cycles completed", type: "number", target: 5, unit: "" },
        { id: "consistency", label: "Volume consistency", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 300
    },
    {
      id: "v3-soft-palate",
      track: "vocal",
      number: 3,
      title: "Lift Soft Palate",
      durationMin: 2,
      original: "1–2 min: stick tongue out and count to 60.",
      steps: [
        "Gently stick your tongue out (comfortable stretch, not pain).",
        "Count aloud to 60 with a taller oral space — think gentle yawn or “hot potato.”",
        "Practice 1–2 minutes total; stop if the tongue or jaw cramps."
      ],
      tips: [
        "Soft palate lift = more open, less nasal resonance.",
        "Imagine smelling a rose — space opens without force.",
        "Keep the neck free and shoulders down."
      ],
      mistakes: ["Forcing the tongue too far", "Rushing the count", "Collapsing into nasal tone"],
      metrics: [
        { id: "countReached", label: "Highest count reached", type: "number", target: 60, unit: "" },
        { id: "openness", label: "Resonance openness", type: "scale", min: 1, max: 5 },
        { id: "comfort", label: "Comfort", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: false, piano: false },
      timerDefaultSec: 120
    },
    {
      id: "v4-articulation-pen",
      track: "vocal",
      number: 4,
      title: "Improve Articulation (Pen)",
      durationMin: 3,
      original: "Count to 60 with a pen in your mouth, focusing on achieving clarity.",
      steps: [
        "Place a clean pen or chopstick gently between your teeth (do not bite hard).",
        "Count 1 to 60 aiming for intelligible consonants.",
        "Remove the pen and count 1 to 20 — notice the ease and clarity boost."
      ],
      tips: [
        "This is resistance training for speech muscles.",
        "Over-work tongue tip and lips for crisp consonants.",
        "Use only safe, clean objects."
      ],
      mistakes: ["Clenching the jaw", "Skipping the pen-off contrast", "Unsafe objects"],
      metrics: [
        { id: "clarityPen", label: "Clarity with pen", type: "scale", min: 1, max: 5 },
        { id: "clarityAfter", label: "Clarity after pen", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 180
    },
    {
      id: "v5-neutral-ears",
      track: "vocal",
      number: 5,
      title: "Neutral Ears (Persona & Story)",
      durationMin: 15,
      original:
        "Prepare a persona: motivator, coach, friend, educator. Try it with a stranger. Begin with a compliment. Prepare and test a story. Review and improve. Document stories.",
      steps: [
        "Write four short persona cards: Motivator, Coach, Friend, Educator (tone, energy, phrases).",
        "Craft a 60–90 second story: setup → turn → point.",
        "Practice on camera without judging mid-delivery (neutral ears).",
        "Optional live practice: genuine compliment → short exchange → story beat.",
        "Review later: what landed? What to tweak? Document the story for reuse."
      ],
      tips: [
        "Neutral ears = collect data after, don’t self-criticize during.",
        "Compliments must be specific and true.",
        "Stories stick when they have one clear takeaway."
      ],
      mistakes: ["Generic compliments", "Over-scripting until it feels fake", "Judging yourself mid-sentence"],
      metrics: [
        { id: "personaReady", label: "Persona readiness", type: "scale", min: 1, max: 5 },
        { id: "storyStructure", label: "Story structure", type: "scale", min: 1, max: 5 },
        { id: "confidence", label: "Delivery confidence", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: false, record: true, piano: false },
      timerDefaultSec: 0
    },
    {
      id: "v6-connect",
      track: "vocal",
      number: 6,
      title: "How to Connect",
      durationMin: 10,
      original: "Find out who they are.",
      steps: [
        "Practice curiosity loops: open question → listen → reflect one detail → deeper question.",
        "Role-play three scenarios: colleague, acquaintance, new contact.",
        "Goal: leave with one real fact about them — not a monologue about you.",
        "Optional: record a 2-minute mock conversation practice."
      ],
      tips: [
        "Aim for roughly 70% listening / 30% speaking.",
        "Use their name; match energy lightly.",
        "Curiosity beats performance."
      ],
      mistakes: ["Waiting to talk instead of listening", "Interviewing like a checklist", "Stealing the spotlight"],
      metrics: [
        { id: "questionQuality", label: "Question quality", type: "scale", min: 1, max: 5 },
        { id: "presence", label: "Listening presence", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 600
    },
    {
      id: "v7-record-review",
      track: "vocal",
      number: 7,
      title: "Record & Review",
      durationMin: 10,
      original:
        "Record a 5–10 minute video of yourself on an improv topic (favourite location / food / movie / TV / game). Leave 1 full day before review. 1) Auditory 2) Visual 3) Transcribe fillers.",
      steps: [
        "Day 0 — Record 5–10 minutes on one improv topic (location, food, movie, TV, or game).",
        "Wait one full day before reviewing (builds objective “neutral ears”).",
        "Review A — Auditory: volume, tonality, pace, diction, breath, filler sounds.",
        "Review B — Visual: posture, face, hands, eye contact with the lens.",
        "Review C — Transcription: mark fillers (um, like, you know), unclear phrases, grammar.",
        "Pick ONE improvement focus for your next practice week."
      ],
      tips: [
        "First pass: note 3 strengths and 3 growth points only.",
        "Filler words are data, not moral failure.",
        "Compare to an earlier recording after 2–3 weeks."
      ],
      mistakes: ["Reviewing immediately while self-conscious", "Listing 20 flaws", "Skipping transcription"],
      metrics: [
        { id: "fillerCount", label: "Filler words counted", type: "number", target: 0, unit: "" },
        { id: "clarity", label: "Message clarity", type: "scale", min: 1, max: 5 },
        { id: "presence", label: "Presence", type: "scale", min: 1, max: 5 },
        { id: "stepsDone", label: "3-step review complete (0–3)", type: "number", target: 3, unit: "" }
      ],
      audio: { timer: true, record: true, piano: false, reviewWorkflow: true },
      timerDefaultSec: 600,
      reviewSteps: [
        {
          id: "auditory",
          title: "1 · Auditory review",
          prompts: [
            "Is volume steady and appropriate?",
            "Is tonality warm / monotone / tense?",
            "Pace: too fast, too slow, or varied well?",
            "Diction: are word endings clear?",
            "Breath: noisy, gasping, or easy?",
            "Filler sounds: um, uh, clicks?"
          ]
        },
        {
          id: "visual",
          title: "2 · Visual review",
          prompts: [
            "Posture: open or collapsed?",
            "Facial expression matches the story?",
            "Hand gestures purposeful or restless?",
            "Eye contact with the camera lens?",
            "Any distracting habits (swaying, touching face)?"
          ]
        },
        {
          id: "transcription",
          title: "3 · Transcription review",
          prompts: [
            "Transcribe a 1–2 minute excerpt (or full if short).",
            "Highlight fillers: um, like, you know, sort of, kind of…",
            "Mark unclear or run-on sentences.",
            "Note grammar or word-choice muddle.",
            "Choose ONE pattern to improve next week."
          ]
        }
      ]
    },
    {
      id: "v8-fluency-metaphors",
      track: "vocal",
      number: 8,
      title: "Improve Fluency (Metaphors)",
      durationMin: 10,
      original: "Metaphors book — practice metaphorical fluency.",
      steps: [
        "Collect or read a few strong metaphors (from a book, talk, or list).",
        "Pick 5 dry topics (work, weather, a process, a goal, a problem).",
        "For each topic, speak for 1 minute using one fresh metaphor.",
        "Log your best metaphor of the day."
      ],
      tips: [
        "A good metaphor maps a concrete image onto an abstract idea.",
        "One strong image beats a pile of clichés.",
        "Practice out loud — fluency lives in the mouth, not on paper."
      ],
      mistakes: ["Stacking clichés", "Metaphors that confuse the point", "Only writing, never speaking"],
      metrics: [
        { id: "metaphorCount", label: "Metaphors spoken", type: "number", target: 5, unit: "" },
        { id: "vividness", label: "Vividness", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 600
    },
    {
      id: "v9-12-week",
      track: "vocal",
      number: 9,
      title: "12-Week Improvement Plan",
      durationMin: 15,
      original:
        "Week 1: pick ONE element, work 7 days, record & review. If not improved → continue same element next week. If improved → pick a new element.",
      steps: [
        "Choose ONE focus element for this week (see catalog in the plan dashboard).",
        "Practice that element daily in short deliberate reps.",
        "At week end: record a short sample and review.",
        "If improved → advance to a new element next week.",
        "If not yet improved → keep the same element another week (no shame — depth over breadth)."
      ],
      tips: [
        "One element at a time compounds faster than “fix everything.”",
        "End-of-week recording is the truth serum.",
        "Celebrate small wins in the review notes."
      ],
      mistakes: ["Switching focus mid-week", "Skipping the record/review gate", "Judging only by bad days"],
      metrics: [
        { id: "daysPracticed", label: "Days practiced this week", type: "number", target: 7, unit: "" },
        { id: "improvement", label: "Perceived improvement", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: false, record: true, piano: false, weekPlan: true },
      timerDefaultSec: 0,
      isWeekPlan: true
    }
  ],
  singing: [
    {
      id: "s1-vocal-fry",
      track: "singing",
      number: 1,
      title: "Vocal Fry → Sustained /A/",
      durationMin: 5,
      original:
        "Breath in 3 seconds; in a normal speaking voice start vocalising an A using vocal fry with good vocal cord closure and air dosing (not breathy); transition to an A sound; hold maximum time; log; try to last 1–2 seconds longer. For 5 minutes.",
      steps: [
        "Inhale gently for 3 seconds.",
        "Start a gentle vocal fry on /A/ (creaky-door feel) — this finds cord closure.",
        "Transition smoothly to a clear speaking-pitch /A/ with steady air (not breathy, not pressed).",
        "Hold as long as comfortable; log the seconds.",
        "Rest; repeat aiming for +1–2 seconds. Practice about 5 minutes total.",
        "Stop immediately if you feel strain or pain."
      ],
      tips: [
        "Fry is a finder for closure, not the artistic goal.",
        "Men: start around a comfortable speaking pitch (roughly A2–D3).",
        "Hydrate; keep volume moderate.",
        "Think “sing like you speak” — easy onset."
      ],
      mistakes: ["Pushing fry hard", "Breathy floating tone", "Throat squeeze on the hold"],
      metrics: [
        { id: "maxHold", label: "Longest hold (seconds)", type: "number", target: 15, unit: "s" },
        { id: "closure", label: "Closure quality", type: "scale", min: 1, max: 5 },
        { id: "air", label: "Air dosing (not breathy)", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, refPitch: "A2" },
      timerDefaultSec: 300,
      holdLogger: true
    },
    {
      id: "s2-solfege-chords",
      track: "singing",
      number: 2,
      title: "/A/ Solfège on Chord Progressions",
      durationMin: 15,
      original:
        "Using the A sound with good vocal closure (fry optional to find closure) and dosing air (not breathy), in a normal sing-like-you-speak manner, sing the A sound in solfège. Choose 4–5 chord progressions; repeat each exercise 5 times.",
      steps: [
        "Warm with a few gentle fry→/A/ onsets if helpful.",
        "Play a progression on the piano (mid-lower male range).",
        "On each chord, sing /A/ on chord tones (e.g. do–mi–sol patterns or roots) with good closure and steady air.",
        "Complete 5 progressions × 5 repetitions each (25 focused reps).",
        "Prioritize closure and air over loudness or perfect vibrato."
      ],
      tips: [
        "Stay in a speak-sing placement — no operatic push needed.",
        "If pitch wobbles, slow down and sing only roots first.",
        "Use the piano as a friend, not a judge."
      ],
      mistakes: ["Breathy tone to “float” high", "Ignoring the piano pitch center", "Rushing reps without rest"],
      metrics: [
        { id: "reps", label: "Reps completed", type: "number", target: 25, unit: "" },
        { id: "pitchComfort", label: "Pitch comfort", type: "scale", min: 1, max: 5 },
        { id: "closure", label: "Closure quality", type: "scale", min: 1, max: 5 },
        { id: "breathiness", label: "Breathiness (1=breathy, 5=clear)", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, progressions: true },
      timerDefaultSec: 900,
      progressions: ["prog1", "prog2", "prog3", "prog4", "prog5"]
    },
    {
      id: "s3-song-stanzas",
      track: "singing",
      number: 3,
      title: "Song Stanzas (Feel / Better Man)",
      durationMin: 20,
      original:
        "Progress exercise 2: instead of only /A/, use 2 stanzas of a song (Feel and Better Man by Robbie Williams). Sing them in solfège every couple of words changing the note, with good closure and air dosing, sing-like-you-speak. Repeat 5 times each song. Stay on correct notes. Use song-appropriate notes in some reps and other chord progressions for variety.",
      steps: [
        "Choose two stanzas you know from Feel and Better Man (use lyrics you have the right to practice with).",
        "Speak the lines first, then speak on pitch, then sing.",
        "Change pitch every couple of words (solfège or /A/ on changing notes) with piano underneath.",
        "Do 5 reps of Feel stanzas and 5 of Better Man.",
        "Some reps: song-friendly progression; other reps: alternate progressions for flexibility.",
        "Keep good closure and dosed air throughout."
      ],
      tips: [
        "Never sacrifice cord closure for melody.",
        "If lost, return to speaking the line on one pitch, then re-add movement.",
        "Mid-lower keys protect the voice while building skill."
      ],
      mistakes: ["Pushing chest too high", "Only memorizing pitch without closure", "Skipping variety progressions"],
      metrics: [
        { id: "repsFeel", label: "Feel reps", type: "number", target: 5, unit: "" },
        { id: "repsBetter", label: "Better Man reps", type: "number", target: 5, unit: "" },
        { id: "accuracy", label: "Note accuracy (self)", type: "scale", min: 1, max: 5 },
        { id: "closure", label: "Closure quality", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, progressions: true, songs: true },
      timerDefaultSec: 1200,
      songs: [
        { id: "feel", title: "Feel — Robbie Williams", keyHint: "Male mid-low friendly key", prog: "songFeel" },
        { id: "better", title: "Better Man — Robbie Williams", keyHint: "Male mid-low friendly key", prog: "songBetter" }
      ]
    }
  ]
};

window.VT_WEEK_ELEMENTS = [
  "Volume",
  "Tonality",
  "Facial expression",
  "Diction",
  "Pace / rate control",
  "Filler reduction",
  "Gestures / body language",
  "Story structure",
  "Resonance / soft palate",
  "Connection questions",
  "Breath support",
  "Vocal closure (singing)"
];

window.VT_STRUCTURED = {
  vocal: ["v1-diction", "v2-volume", "v3-soft-palate", "v4-articulation-pen", "v5-neutral-ears", "v6-connect", "v7-record-review", "v8-fluency-metaphors", "v9-12-week"],
  singing: ["s1-vocal-fry", "s2-solfege-chords", "s3-song-stanzas"]
};
