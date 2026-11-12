/**
 * Enhanced exercise library — Vocal speaking + Singing technique + complementary
 * Basic tier = original homework spine. Advanced = research-backed expansions.
 * Source spirit: Vocal training and Singing training Homework.md
 */
window.VT_EXERCISES = {
  vocal: [
    /* ─── BASIC TIER (homework spine) ─── */
    {
      id: "v1-diction",
      track: "vocal",
      tier: "basic",
      number: 1,
      title: "Better Diction",
      durationMin: 5,
      original:
        "Grab book, rote-read same page. For 5 minutes. Overdo mouth movements. Rates of speech: 5,6,7,8.",
      research: "Foundations: over-articulation builds clarity range so everyday speech lands cleaner.",
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
      mistakes: ["Changing pages", "Only moving lips, not tongue tip", "Mumbling at higher rates"],
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
      tier: "basic",
      number: 2,
      title: "Maintain Volume",
      durationMin: 5,
      original: "Count from 1 to 10 keeping the same energy throughout. Until you naturally run out of breath.",
      research: "Volume signals confidence and authority.",
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
      tier: "basic",
      number: 3,
      title: "Lift Soft Palate",
      durationMin: 2,
      original: "1–2 min stick tongue out and count to 60.",
      research: "Open oral space improves resonance and reduces nasal collapse in speech.",
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
      tier: "basic",
      number: 4,
      title: "Improve Articulation (Pen)",
      durationMin: 3,
      original: "Count to 60 with pen in mouth focusing on achieving clarity.",
      research: "Articulation contrast can make consonant movements easier to notice. A pen is optional; this is not proven speech-muscle strengthening.",
      steps: [
        "Safest option: count with exaggerated consonants and no object. If you choose the original pen variation, use a clean, blunt object held still without biting.",
        "Count 1 to 60 aiming for intelligible consonants.",
        "Count 1 to 20 normally (remove the object first if you used one); compare clarity and comfort without assuming an automatic boost."
      ],
      tips: [
        "Use the contrast to notice your articulation, not to force the jaw or claim strength gains.",
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
      tier: "basic",
      number: 5,
      title: "Neutral Ears (Persona & Story)",
      durationMin: 15,
      original:
        "Prepare a persona: motivador, coach, friend, educator and try it out with a stranger. Begin with a compliment. Also prepare and test a story. Review and improve.",
      research: "Persona flexibility + story practice builds adaptive presence.",
      steps: [
        "Write four short persona cards: Motivator, Coach, Friend, Educator.",
        "Craft a 60–90 second story: setup → turn → point.",
        "Practice on camera without judging mid-delivery (neutral ears).",
        "Optional live practice: genuine compliment → short exchange → story beat.",
        "Review later: what landed? Document the story for reuse."
      ],
      tips: [
        "Neutral ears = collect data after, don’t self-criticize during.",
        "Compliments must be specific and true.",
        "Stories stick when they have one clear takeaway."
      ],
      mistakes: ["Generic compliments", "Over-scripting until fake", "Judging mid-sentence"],
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
      tier: "basic",
      number: 6,
      title: "How to Connect",
      durationMin: 10,
      original: "How to connect with someone: find out who they are.",
      research: "Connection starts with curiosity about the other person, not performance.",
      steps: [
        "Practice curiosity loops: open question → listen → reflect one detail → deeper question.",
        "Role-play three scenarios: colleague, acquaintance, new contact.",
        "Goal: leave with one real fact about them — not a monologue about you."
      ],
      tips: [
        "Aim for roughly 70% listening / 30% speaking.",
        "Use their name; match energy lightly.",
        "Curiosity beats performance."
      ],
      mistakes: ["Waiting to talk instead of listening", "Interview checklist energy", "Stealing the spotlight"],
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
      tier: "basic",
      number: 7,
      title: "Record & Review",
      durationMin: 10,
      original:
        "Record a 5–10 minute video — improv topic. Leave 1 full day before review. 1) Auditory 2) Visual 3) Transcribe fillers.",
      research: "Delayed review builds objective ‘neutral ears’ and surfaces fillers that mid-talk self-judgment misses.",
      steps: [
        "Day 0 — Record 5–10 minutes on one improv topic.",
        "Wait one full day before reviewing.",
        "Review A — Auditory: volume, tonality, pace, diction, breath, fillers.",
        "Review B — Visual: posture, face, hands, eye contact with the lens.",
        "Review C — Transcription: mark fillers and unclear phrases.",
        "Pick ONE improvement focus for next week."
      ],
      tips: [
        "First pass: 3 strengths and 3 growth points only.",
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
          titleEs: "1 · Revisión con el oído",
          prompts: [
            { en: "Is volume steady and appropriate?", es: "¿El volumen es estable y adecuado?" },
            { en: "Is tonality warm / monotone / tense?", es: "¿El tono suena cálido, monótono o tenso?" },
            { en: "Pace: too fast, too slow, or varied well?", es: "Ritmo: ¿muy rápido, muy lento o bien variado?" },
            { en: "Diction: are word endings clear?", es: "Dicción: ¿se oyen los finales de palabra?" },
            { en: "Breath: noisy, gasping, or easy?", es: "Respiración: ¿ruidosa, entrecortada o tranquila?" },
            { en: "Filler sounds: um, uh, clicks?", es: "Muletillas: ¿eh, este, chasquidos?" }
          ]
        },
        {
          id: "visual",
          title: "2 · Visual review",
          titleEs: "2 · Revisión con la vista",
          prompts: [
            { en: "Posture: open or collapsed?", es: "Postura: ¿abierta o hundida?" },
            { en: "Facial expression matches the story?", es: "¿La expresión de la cara acompaña la historia?" },
            { en: "Hand gestures purposeful or restless?", es: "¿Gestos con intención o manos inquietas?" },
            { en: "Eye contact with the camera lens?", es: "¿Miras a la lente de la cámara?" },
            { en: "Any distracting habits?", es: "¿Algún hábito que distraiga?" }
          ]
        },
        {
          id: "transcription",
          title: "3 · Transcription review",
          titleEs: "3 · Revisión con la transcripción",
          prompts: [
            { en: "Transcribe a 1–2 minute excerpt.", es: "Transcribe un fragmento de 1–2 minutos." },
            { en: "Highlight fillers: um, like, you know…", es: "Marca las muletillas: eh, o sea, este…" },
            { en: "Mark unclear or run-on sentences.", es: "Señala frases confusas o que no terminan." },
            { en: "Choose ONE pattern to improve next week.", es: "Elige UN patrón para mejorar la próxima semana." }
          ]
        }
      ]
    },
    {
      id: "v8-fluency-metaphors",
      track: "vocal",
      tier: "basic",
      number: 8,
      title: "Improve Fluency (Metaphors)",
      durationMin: 10,
      original: "Improve fluency: Metaphors book.",
      research: "Metaphorical language increases memorability and fluency under pressure.",
      steps: [
        "Collect a few strong metaphors.",
        "Pick 5 dry topics; speak 1 minute each with one fresh metaphor.",
        "Log your best metaphor of the day."
      ],
      tips: [
        "Concrete image + mapping beats a pile of clichés.",
        "Practice out loud — fluency lives in the mouth."
      ],
      mistakes: ["Stacking clichés", "Confusing metaphors", "Only writing, never speaking"],
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
      tier: "basic",
      number: 9,
      title: "12-Week Improvement Plan",
      durationMin: 15,
      original:
        "Week 1: Pick ONE element… RECORD and REVIEW. If not improved, continue. If improved, pick a new element.",
      research: "Deliberate single-focus practice compounds faster than fixing everything at once.",
      steps: [
        "Choose ONE focus element for this week.",
        "Practice that element daily in short deliberate reps.",
        "At week end: record a short sample and review.",
        "If improved → advance; if not → keep the same element another week."
      ],
      tips: ["One element at a time", "End-of-week recording is the truth serum", "Celebrate small wins"],
      mistakes: ["Switching focus mid-week", "Skipping record/review", "Judging only by bad days"],
      metrics: [
        { id: "daysPracticed", label: "Days practiced this week", type: "number", target: 7, unit: "" },
        { id: "improvement", label: "Perceived improvement", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: false, record: true, piano: false, weekPlan: true },
      timerDefaultSec: 0,
      isWeekPlan: true
    },

    /* ─── ADVANCED TIER (speaking expansions) ─── */
    {
      id: "v10-power-pause",
      track: "vocal",
      tier: "advanced",
      number: 10,
      title: "Power of the Pause",
      durationMin: 8,
      original: "Strategic silence for processing, authority, and fewer fillers.",
      research:
        "Pauses give listeners time to process, give you time to think, and replace um/uh with intentional silence — increasing clarity, authority, and credibility.",
      steps: [
        "Choose a 60–90 second topic you know well.",
        "Speak it once at normal pace (baseline).",
        "Speak it again inserting a full 1–2 second pause after every key idea.",
        "Notice the urge to fill silence — breathe instead of ‘um’.",
        "Final take: only pause where impact matters (peak points).",
        "Record and mark where pauses helped vs where they felt random."
      ],
      tips: [
        "Silence feels longer to you than to the listener.",
        "Pause after the point — not in the middle of a phrase.",
        "Comfortable pause = control; rushing = anxiety pattern."
      ],
      mistakes: ["Filling every gap with ‘so/um’", "Pausing mid-word", "Apologizing for silence"],
      metrics: [
        { id: "pauseCount", label: "Intentional pauses used", type: "number", target: 6, unit: "" },
        { id: "fillerReduction", label: "Filler control", type: "scale", min: 1, max: 5 },
        { id: "authority", label: "Felt authority", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 480
    },
    {
      id: "v11-kill-fillers",
      track: "vocal",
      tier: "advanced",
      number: 11,
      title: "Kill the Fillers",
      durationMin: 8,
      original: "When you feel um/ah rising, pause instead.",
      research:
        "Fillers chip credibility. The fix isn’t faster speech — it’s getting comfortable with silence so the brain chooses pause over clutter.",
      steps: [
        "Pick a topic and speak for 2 minutes without stopping yourself mid-flow.",
        "Replay or note every um, uh, like, you know, so…",
        "Re-do the same topic: every time you want a filler, close your mouth and pause 1 second.",
        "Do 3 rounds. Aim for fewer fillers each round, not perfection.",
        "Log your best filler count."
      ],
      tips: [
        "Replace filler with breath + eye contact.",
        "Starting sentences with ‘so’ is often a filler — begin on the real word.",
        "Track patterns (before hard words? after questions?)."
      ],
      mistakes: ["Trying to eliminate all fillers in one day", "Speaking slower without intentional pauses", "Self-shaming mid-sentence"],
      metrics: [
        { id: "fillerCount", label: "Fillers in best take", type: "number", target: 0, unit: "" },
        { id: "awareness", label: "Filler awareness", type: "scale", min: 1, max: 5 },
        { id: "replacement", label: "Pause-instead success", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 480
    },
    {
      id: "v12-melodic-speech",
      track: "vocal",
      tier: "advanced",
      number: 12,
      title: "Melodic Speech & Tonality",
      durationMin: 8,
      original: "Expand tonality: speech can use melody like music — variety prevents monotony.",
      research:
        "Tonality is a vocal foundation; monotony loses attention. Musical variety (ups, downs, color) keeps listeners engaged.",
      steps: [
        "Read a short paragraph in a flat monotone (baseline).",
        "Re-read with exaggerated melody: lift key words, land endings downward for authority.",
        "Mark 3 words to ‘color’ (warmth, surprise, resolve).",
        "Final take at natural-but-musical range.",
        "Optional: match a simple piano motif then speak the sentence with similar contour."
      ],
      tips: [
        "Downward cadence at ends signals confidence; perpetual upspeak can sound uncertain.",
        "Change melody on meaning, not randomly.",
        "Record — ears catch monotony better than memory."
      ],
      mistakes: ["Fake theatrical overacting without meaning", "One pitch forever", "Only going up at every comma"],
      metrics: [
        { id: "variety", label: "Tonality variety", type: "scale", min: 1, max: 5 },
        { id: "naturalness", label: "Still natural?", type: "scale", min: 1, max: 5 },
        { id: "engagement", label: "Engagement feel", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true },
      timerDefaultSec: 480,
      progressions: ["prog1"]
    },
    {
      id: "v13-volume-ladder",
      track: "vocal",
      tier: "advanced",
      number: 13,
      title: "Volume Ladder",
      durationMin: 6,
      original: "Volume theory: control the full range from intimate to projected without strain.",
      research:
        "Volume shows confidence and authority when controlled. Laddering builds flexible dynamics for different rooms and moments.",
      steps: [
        "Pick one short sentence you use often (8–12 words).",
        "Say it at 5 levels: 1 almost a whisper → 2 soft → 3 conversational → 4 projected → 5 full room (no shouting).",
        "Come back down 5 → 3 → 1 with the same sentence; repeat the ladder 3 times.",
        "Then tell a 60 s story using at least 3 levels, on purpose.",
        "Keep the same clarity and diction at every level."
      ],
      tips: [
        "Projection comes from support + intention, not throat squeeze.",
        "Match volume to emotional peak, not random loudness.",
        "If hoarse, stop — rest voice."
      ],
      mistakes: ["Shouting at level 5", "Only two volumes (soft/loud)", "Losing diction when louder"],
      metrics: [
        { id: "ladderReps", label: "Full ladder reps", type: "number", target: 3, unit: "" },
        { id: "control", label: "Dynamic control", type: "scale", min: 1, max: 5 },
        { id: "ease", label: "Ease / no strain", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 360
    },
    {
      id: "v14-pace-variation",
      track: "vocal",
      tier: "advanced",
      number: 14,
      title: "Pace Variation for Impact",
      durationMin: 7,
      original: "Slow down on points that matter; speed can create energy, slow creates weight.",
      research:
        "Varying pace keeps audiences engaged. Slow on key ideas; allow processing time; avoid one-speed delivery.",
      steps: [
        "Pick a message of about 90 s with 3 key ideas.",
        "First pass: an even pace.",
        "Second pass: slow down only on the key ideas (about half speed) and speed up the rest a little.",
        "Third pass: put a “brake” (a pause) before each key idea, then slow down on it.",
        "Record it and pick the clearest version."
      ],
      tips: [
        "Slow ≠ boring when intention is clear.",
        "Pair slow pace with pause for maximum weight.",
        "Don’t rush endings — land them."
      ],
      mistakes: ["Constant rush", "Constant slow drone", "Slowing randomly without meaning"],
      metrics: [
        { id: "keySlowdowns", label: "Intentional slow-downs", type: "number", target: 3, unit: "" },
        { id: "paceCraft", label: "Pace craft", type: "scale", min: 1, max: 5 },
        { id: "clarity", label: "Clarity of key points", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 420
    },
    {
      id: "v15-gestures",
      track: "vocal",
      tier: "advanced",
      number: 15,
      title: "Hand Gestures & Body Language",
      durationMin: 8,
      original: "Visual channel of communication: purposeful gestures amplify message.",
      research:
        "Record-review emphasizes hand gestures and body language as equal to vocal foundations.",
      steps: [
        "Speak 60s with hands in pockets or clasped (notice deadness).",
        "Re-do with open palms, intentional beats on key words.",
        "Practice 3 gesture types: size (big idea), count (1-2-3), location (here/there).",
        "Film waist-up; review visual channel only first."
      ],
      tips: [
        "Gestures slightly before or with the word, not after.",
        "Rest hands in a calm home base between gestures.",
        "Face and hands should agree with the words."
      ],
      mistakes: ["Random flapping", "Frozen arms", "Gesturing only for show"],
      metrics: [
        { id: "purposeful", label: "Gesture purposefulness", type: "scale", min: 1, max: 5 },
        { id: "congruence", label: "Body-word congruence", type: "scale", min: 1, max: 5 },
        { id: "stillness", label: "Calm between gestures", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 480
    },
    {
      id: "v16-facial-expression",
      track: "vocal",
      tier: "advanced",
      number: 16,
      title: "Facial Expressiveness",
      durationMin: 6,
      original: "Face carries emotion; resting tension (RBF) can undercut warm words.",
      research:
        "Communication coaching often flags face–voice mismatch. Soften resting face; animate on emotional peaks.",
      steps: [
        "Check resting face in a mirror or camera (neutral photo).",
        "Practice a warm ‘hello’ face for 10 seconds (eyes + slight smile).",
        "Tell a 60s story with 3 intentional face changes: curiosity, surprise, resolve.",
        "Review muted video first — does the face tell the story?"
      ],
      tips: [
        "Brows and eyes carry more than mouth alone.",
        "Warmth can be subtle — not a constant grin.",
        "Match face to meaning; overacting reads fake."
      ],
      mistakes: ["Frozen face", "Constant smile", "Emotions lag 2 seconds behind words"],
      metrics: [
        { id: "animation", label: "Facial animation", type: "scale", min: 1, max: 5 },
        { id: "congruence", label: "Face-voice match", type: "scale", min: 1, max: 5 },
        { id: "warmth", label: "Warmth", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 360
    },
    {
      id: "v17-strategic-concision",
      track: "vocal",
      tier: "advanced",
      number: 17,
      title: "Strategic Concision",
      durationMin: 8,
      original: "Concise method: receive → breathe → refine → share.",
      research:
        "Speak clearly and concisely by embracing the pause — receive the question, breathe, refine the thought, then share.",
      steps: [
        "List 5 practice questions (work or life).",
        "For each: count 3 silent beats before answering.",
        "Answer in ≤3 sentences.",
        "Record one Q&A block; cut any sentence that doesn’t earn its place."
      ],
      tips: [
        "Thinking silence is professional, not weak.",
        "Lead with the answer, then support.",
        "If rambling, pause and restart one clean sentence."
      ],
      mistakes: ["Filling think-time with um", "Prefacing forever", "Never landing the point"],
      metrics: [
        { id: "questions", label: "Questions practiced", type: "number", target: 5, unit: "" },
        { id: "concision", label: "Concision", type: "scale", min: 1, max: 5 },
        { id: "pauseBefore", label: "Pre-answer pause habit", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 480
    },
    {
      id: "v18-story-peak",
      track: "vocal",
      tier: "advanced",
      number: 18,
      title: "Storytelling Peak Emotion",
      durationMin: 10,
      original: "Storytelling secret: focus on the peak emotion or action.",
      research:
        "Memorable stories emphasize the peak emotional turn, not every detail. Setup is short; the turn is vivid; the point is clear.",
      steps: [
        "Choose a true personal story you can tell in about 90 seconds.",
        "Plan it: context → tension → peak moment (sensory detail) → point (1 sentence).",
        "Deliver emphasizing the peak with pace, volume, and pause.",
        "Remove one unnecessary setup detail; re-deliver tighter."
      ],
      tips: [
        "Golden rule: one clear takeaway.",
        "Peak = what changed for you in the moment.",
        "End on the point — don’t trail into ‘and yeah…’."
      ],
      mistakes: ["Too much setup", "No emotional peak", "Forgetting the point"],
      metrics: [
        { id: "peakClarity", label: "Peak clarity", type: "scale", min: 1, max: 5 },
        { id: "structure", label: "Structure (setup-peak-point)", type: "scale", min: 1, max: 5 },
        { id: "impact", label: "Impact", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 600
    },
    {
      id: "v19-authority-close",
      track: "vocal",
      tier: "advanced",
      number: 19,
      title: "Authority Close (Cadence)",
      durationMin: 6,
      original: "End statements with downward cadence and a pause — land your point.",
      research:
        "Authority is often lost in trailing endings and upspeak. Land the last word; pause; let it sit.",
      steps: [
        "Write 5 short claims (opinions you hold).",
        "Say each ending with a downward pitch and full stop energy.",
        "Hold a 1-second pause after each — no ‘you know?’ tag.",
        "Record a 60s summary ending on your strongest claim."
      ],
      tips: [
        "Questions can rise; statements should land.",
        "Smile with eyes without lifting the pitch out of authority.",
        "Practice in the mirror: chin level, not tucked."
      ],
      mistakes: ["Every sentence sounds like a question", "Rushing the last word", "Apologetic endings"],
      metrics: [
        { id: "landed", label: "Clean landings", type: "number", target: 5, unit: "" },
        { id: "authority", label: "Authority feel", type: "scale", min: 1, max: 5 },
        { id: "noTag", label: "Avoided tag questions", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 360
    },
    {
      id: "v20-energy-match",
      track: "vocal",
      tier: "advanced",
      number: 20,
      title: "Energy Match & Charisma",
      durationMin: 8,
      original: "Match and gently lead the room’s energy — charisma as calibrated presence.",
      research:
        "Charisma often looks like calibrated energy: match the listener, then lead slightly. Too flat loses people; too high overwhelms.",
      steps: [
        "Practice three energy levels for the same 30s message: low, medium, high.",
        "Imagine three listeners (tired colleague, excited friend, formal panel).",
        "Match each; then lead 10% brighter.",
        "Record one version for your most common real context."
      ],
      tips: [
        "Energy is pace + volume + face + gesture together.",
        "Leading 10% feels magnetic; 50% feels try-hard.",
        "Breath is the dimmer switch."
      ],
      mistakes: ["One energy for all rooms", "Fake hype", "Collapsing energy mid-message"],
      metrics: [
        { id: "flexibility", label: "Energy flexibility", type: "scale", min: 1, max: 5 },
        { id: "calibration", label: "Calibration", type: "scale", min: 1, max: 5 },
        { id: "authenticity", label: "Authenticity", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 480
    },
    {
      id: "v21-straw-to-speech",
      track: "vocal",
      tier: "advanced",
      number: 21,
      title: "Straw to Speech",
      durationMin: 5,
      original: "A soft sound through a straw, then a sentence just as easy.",
      research:
        "Phonating through a straw is a semi-occluded vocal tract exercise. An integrative review of 53 studies (Apfelbach & Guzmán, 2024) found that it tends to lower the effort needed to start the voice right afterwards; the effect is short-term and varies by person. Going straight from the straw into a sentence follows the flow-resistant tube protocol tested in people with voice problems (Kapsner-Smith et al., 2015); in healthy speakers that carry-over step is expert practice, not a tested result. It is practice, not treatment.",
      steps: [
        "Use your own clean drinking straw. Seal your lips around it so all the air leaves through the straw; cheeks loose.",
        "Make a soft “oo” through the straw at a comfortable speaking pitch. Hold 3 to 5 seconds, breathe, repeat.",
        "Slide a little up and back down, like a small siren, still through the straw.",
        "Make waves of loudness on one breath (oo-OO-oo-OO): the push comes from the belly, the throat stays loose.",
        "“Say” your first sentence through the straw: only its melody and rhythm come out.",
        "Take the straw away and say the same sentence with the same ease. Say it twice, then keep talking."
      ],
      tips: [
        "Soft is the point: if your cheeks puff or the sound stops, use less air or a wider straw.",
        "Do it shortly before you speak: what it changes is short-lived.",
        "Stop if you feel dizzy, sore or hoarse. Never share a straw."
      ],
      mistakes: ["Blowing air with no voice", "Pushing for volume", "Skipping the sentence without the straw"],
      metrics: [
        { id: "strawHolds", label: "Soft sounds of 1.5 s or more (heard)", labelEs: "Sonidos suaves de 1,5 s o más (oídos)", type: "number", target: 4, unit: "" },
        { id: "easeAfter", label: "Ease of speaking afterwards", labelEs: "Facilidad al hablar después", type: "scale", min: 1, max: 5 },
        { id: "carryOver", label: "The sentence kept the easy feeling", labelEs: "La frase conservó la facilidad", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 300
    },
    {
      id: "v22-voice-recovery",
      track: "vocal",
      tier: "advanced",
      number: 22,
      title: "Voice Recovery",
      durationMin: 10,
      original: "After heavy talking: 5 quiet minutes, then 5 of soft straw.",
      research:
        "In a randomised trial of 114 healthy adults who had loaded their voices for an hour, five minutes of quiet followed by five of gentle straw phonation recovered the voice better than ten minutes of quiet alone (Peng et al., 2026). It is one study with short-term measures, and no study shows that a cool-down prevents voice problems. Recovery after heavy use takes hours (Hunter & Titze, 2009): expect most of it by the next morning. It is practice, not treatment.",
      steps: [
        "Five minutes without talking or whispering. Sip water and breathe through your nose.",
        "With your own clean straw, make a soft “oo” at a comfortable pitch. Hold 3 to 5 seconds, breathe, repeat, unhurried.",
        "Slide slowly from a middle pitch down to a low one, through the straw. Soft, never pushed.",
        "Finish with a few soft, low “oo”s. Then say one easy sentence without the straw."
      ],
      tips: [
        "Quiet means no talking and no whispering: a chime tells you when the five minutes are over.",
        "Use it after 45 to 60 minutes or more of heavy talking: a class, a shift on the phone, a long meeting.",
        "If hoarseness lasts more than four weeks (sooner if you work with your voice), or there is pain or trouble breathing, see an ear, nose and throat doctor."
      ],
      mistakes: ["Talking through the quiet minutes", "Pushing the straw sound loud", "Using it in place of a doctor when hoarseness lasts"],
      metrics: [
        { id: "quietMin", label: "Quiet minutes (heard)", labelEs: "Minutos en silencio (oídos)", type: "number", target: 5, unit: "" },
        { id: "strawHolds", label: "Soft sounds of 1.5 s or more (heard)", labelEs: "Sonidos suaves de 1,5 s o más (oídos)", type: "number", target: 6, unit: "" },
        { id: "comfortAfter", label: "Voice comfort afterwards", labelEs: "Comodidad de la voz después", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 600
    },
    {
      id: "v23-clear-speech",
      track: "vocal",
      tier: "advanced",
      number: 23,
      title: "Clear Speech",
      durationMin: 4,
      original: "Say it your usual way, then as if to someone who hears poorly.",
      research:
        "Asked to speak as if to a listener who hears poorly, talkers slow down, pause more and finish their sounds, and listeners understand more: about 17 percentage points more words for listeners with hearing loss in the classic study (Picheny et al., 1985), a benefit that a later review also found for other listeners and in noise (Smiljanić & Bradlow, 2009). The benefit is the listener's and was measured in the lab; how far a short daily drill carries into everyday talk has not been tested. The phone compares your two takes with each other: it cannot hear how clear you were.",
      steps: [
        "Choose one sentence you will really say this week, with a name, a number or a day in it.",
        "Take A: say it the way you usually do.",
        "Take B: say it as if to someone who hears poorly, across a table: a little slower, every ending finished, a short pause between ideas. Not louder.",
        "Clear again with the sentence on screen: give the day, the time and the place their full shape.",
        "Now talk for a minute at your normal pace and keep only the finished endings and the pauses."
      ],
      tips: [
        "Slow down by pausing, not by stretching every word.",
        "After Stop, listen to A and B back to back: the difference you hear matters more than the numbers.",
        "Use it where it counts: names, numbers, instructions, the first sentence of a call."
      ],
      mistakes: ["Getting louder instead of clearer", "Spelling out every syllable like a robot", "Dropping the ends of sentences"],
      metrics: [
        { id: "clarityBack", label: "Clarity when you listen back", labelEs: "Claridad al escucharte", type: "scale", min: 1, max: 5 },
        { id: "naturalClear", label: "Clear but still natural", labelEs: "Clara y aun así natural", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 240
    },
    {
      id: "v24-vocal-function",
      track: "vocal",
      tier: "advanced",
      number: 24,
      title: "Vocal Function",
      durationMin: 7,
      original: "One long sound, two glides and five notes, all of it soft.",
      research:
        "The Vocal Function Exercises (Stemple et al., 1994) are four soft exercises done twice each, twice a day, for about six weeks. In healthy voices they lengthened how long people could sustain a sound in small controlled trials (Stemple et al., 1994, 35 women; Bane et al., 2019), and a systematic review of 21 studies reported no adverse effects (Angadi et al., 2019). What improves is the trained task itself; a benefit for everyday speaking has not been shown, and prevention has not been tested. The clinic sets a personal time goal from lung volume; this app cannot, so the rule here is “as long as it stays easy”.",
      steps: [
        "Stand or sit tall. Everything here is as soft as you can make it with the voice still clear.",
        "Long sound: a soft, bright “ee” on one comfortable note, for as long as it stays easy. Stop before you squeeze. Twice.",
        "Glide up: lips rounded and almost closed on “oh”, slide slowly from your lowest easy note to your highest easy note. Twice.",
        "Glide down: the same shape, from high to low. Twice.",
        "Five notes: the same soft “oh” on five comfortable notes from low to high, each for as long as it stays easy. Then the five again."
      ],
      tips: [
        "The dose the studies used: each exercise twice, twice a day, for six weeks. Doing each only once per session was not enough in one of them.",
        "If the voice breaks in a glide, stay soft and keep going: never push through.",
        "Stop if you feel pain or burning, or end up hoarser than you started."
      ],
      mistakes: ["Holding on until the throat squeezes", "Loud instead of soft", "Rushing the glides"],
      metrics: [
        { id: "longHolds", label: "Sounds of 3 s or more (heard)", labelEs: "Sonidos de 3 s o más (oídos)", type: "number", target: 10, unit: "" },
        { id: "longestHold", label: "Longest easy sound, in seconds (heard)", labelEs: "Sonido cómodo más largo, en segundos (oído)", type: "number", target: 10, unit: "s" },
        { id: "easyVoice", label: "Easy voice, no squeeze", labelEs: "Voz cómoda, sin apretar", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false },
      timerDefaultSec: 420
    },

    /* ─── SINGING track continues below in singing array ─── */
  ],

  singing: [
    /* ─── BASIC TIER (singing foundations) ─── */
    {
      id: "s1-vocal-fry",
      track: "singing",
      tier: "basic",
      number: 1,
      title: "Vocal Fry → Sustained /A/",
      durationMin: 5,
      original:
        "Use a gentle vocal fry to feel cord closure, then ease into a clear /A/ with steady air (no force).",
      research:
        "A soft fry can help you feel efficient cord contact before clear tone; keep air steady so the sound stays free, not breathy or pressed.",
      steps: [
        "Inhale gently through the nose (~3 seconds) — enough air, not a huge gasp.",
        "Start a soft vocal fry on /A/ (creaky-door feel) to sense cord closure.",
        "Without pushing, transition to a clear speaking-pitch /A/ with steady air.",
        "Hold as long as comfortable; solid holds of 2+ seconds are logged when you release.",
        "Rest; repeat aiming for +1–2 seconds. Prefer clean tone over volume. ~5 minutes."
      ],
      tips: [
        "Fry is a finder for closure, not the artistic goal.",
        "Poor closure often feels like excess air, effort, or quick fatigue — ease pressure.",
        "Men: start around comfortable speaking pitch (A2–D3).",
        "Build from comfort, not force; progress needs patient repetition."
      ],
      mistakes: [
        "Pushing fry hard",
        "Breathy floating tone after the transition",
        "Throat squeeze on the hold",
        "Trying to get loud by pressing"
      ],
      metrics: [
        { id: "maxHold", label: "Longest hold (seconds)", type: "number", target: 15, unit: "s" },
        { id: "closure", label: "Closure quality", type: "scale", min: 1, max: 5 },
        { id: "air", label: "Air dosing (not breathy)", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, refPitch: "A2", pitchViz: true },
      timerDefaultSec: 300,
      holdLogger: true
    },
    {
      id: "s2-solfege-chords",
      track: "singing",
      tier: "basic",
      number: 2,
      title: "/A/ Solfège on Chord Progressions",
      durationMin: 15,
      original:
        "Sing A in solfège with good closure over 4–5 chord progressions; each ×5. Sing like you speak.",
      research: "Chord-anchored solfège builds pitch center with speech-like ease.",
      steps: [
        "Warm with a few gentle fry→/A/ onsets if helpful.",
        "Play a progression (mid-lower male range).",
        "On each chord, sing /A/ on chord tones with good closure and steady air.",
        "Complete 5 progressions × 5 repetitions.",
        "Enable Sustain on the piano so each chord rings 3–5s while you home in."
      ],
      tips: [
        "Use pitch visualizer to see accuracy (on note) and precision (stable band).",
        "Prioritize closure and air over loudness.",
        "Slow down if pitch wobbles — roots first."
      ],
      mistakes: ["Breathy float", "Ignoring piano center", "Rushing reps"],
      metrics: [
        { id: "reps", label: "Reps completed", type: "number", target: 25, unit: "" },
        { id: "pitchComfort", label: "Pitch comfort", type: "scale", min: 1, max: 5 },
        { id: "closure", label: "Closure quality", type: "scale", min: 1, max: 5 },
        { id: "breathiness", label: "Clarity of tone (5=clear)", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, progressions: true, pitchViz: true },
      timerDefaultSec: 900,
      progressions: [
        "prog1",
        "prog2",
        "prog3",
        "prog4",
        "prog5",
        "progJump1",
        "progJump2",
        "progJump3",
        "progJump4"
      ]
    },
    {
      id: "s3-song-stanzas",
      track: "singing",
      tier: "basic",
      number: 3,
      title: "Song Stanzas (your songs)",
      durationMin: 20,
      original:
        "Apply technique to song phrases you know: finish each phrase without mid-phrase gasps; dose air; keep intonation.",
      research:
        "Early song work should prioritize breath between phrases, air dosing, and clean sound — not ‘pretty’ volume.",
      steps: [
        "Pick two short phrases/stanzas from songs you know (public-domain or your own lyrics).",
        "Speak → speak-on-pitch → sing, with piano under you.",
        "Goal: complete each musical phrase without breathing in the middle.",
        "Change pitch every couple of words when practicing flexibility; keep closure.",
        "Log 5 phrase-complete reps per song; use Sustain + pitch graph to settle notes."
      ],
      tips: [
        "Priority is correct tools (air, closure, pitch) — not sounding ‘pretty’ yet.",
        "Breathe between phrases; don’t dump all air on the first word.",
        "Never sacrifice closure for melody; mid-lower keys protect the voice.",
        "Discover comfortable body sensations — your voice is a personal instrument."
      ],
      mistakes: [
        "Breathing mid-phrase from poor air dosing",
        "Pushing chest too high",
        "Only memorizing pitch without closure",
        "Forcing volume with throat instead of support"
      ],
      metrics: [
        { id: "repsFeel", label: "Song A phrase-complete reps", type: "number", target: 5, unit: "" },
        { id: "repsBetter", label: "Song B phrase-complete reps", type: "number", target: 5, unit: "" },
        { id: "accuracy", label: "Note accuracy (self)", type: "scale", min: 1, max: 5 },
        { id: "closure", label: "Closure quality", type: "scale", min: 1, max: 5 },
        { id: "phraseBreath", label: "Phrase without a mid-phrase pause", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, progressions: true, songs: true, pitchViz: true },
      timerDefaultSec: 1200,
      songs: [
        { id: "feel", title: "Song A (mid-low range)", keyHint: "Male mid-low friendly key", prog: "songFeel" },
        { id: "better", title: "Song B (mid-low range)", keyHint: "Male mid-low friendly key", prog: "songBetter" }
      ]
    },
    {
      id: "s15-sh-air-ladder",
      track: "singing",
      tier: "basic",
      number: 15,
      title: "SH Air-Dosing Ladder",
      durationMin: 8,
      original:
        "Try an easy, even SH for 5 seconds; longer ladder rungs are optional, never a breath-holding contest.",
      research:
        "A voiceless SH provides a simple airflow pacing task, but longer hiss times do not by themselves prove better singing support. Transfer the easy sensation to a sung phrase.",
      steps: [
        "Inhale comfortably, without a large gasp; sit if you feel unsteady.",
        "Exhale on a gentle, even SH, without pulsing or squeezing the throat.",
        "Try 5 seconds, then rest. Explore 10→20→25→30 seconds only if still easy; it is fine to leave longer rungs unfinished.",
        "Stop the hiss while the neck and jaw are relaxed, even if the timer has not reached a rung.",
        "Transfer: after resting, sing a soft /A/ for 3–5 comfortable seconds; compare ease, not maximum duration."
      ],
      tips: [
        "The display is a sound/Space-timing aid, not a measurement of lung function or breath support.",
        "Even, easy sound and transfer to a sung phrase matter more than your highest rung.",
        "Rest between attempts; two or three comfortable tries can be enough.",
        "If dizzy, breathless, hoarse, or sore: stop; do not push the last seconds."
      ],
      mistakes: [
        "Chasing the 30-second target while uncomfortable",
        "Pulsing or chopping the SH",
        "Neck/jaw push at the end",
        "Skipping rests or treating a Space-assisted timer as airflow measurement"
      ],
      metrics: [
        { id: "rungs", label: "Comfortable ladder rungs (1 is enough)", labelEs: "Peldaños cómodos (1 basta)", type: "number", target: 1, unit: "" },
        { id: "maxSH", label: "Comfortable SH length (5s baseline)", labelEs: "Duración cómoda del SH (base de 5 s)", type: "number", target: 5, unit: "s" },
        { id: "evenness", label: "Air evenness", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: false, pitchViz: false },
      timerDefaultSec: 480
    },
    {
      id: "s16-major-scale-coord",
      track: "singing",
      tier: "basic",
      number: 16,
      title: "Major Scale Coordination",
      durationMin: 8,
      original:
        "Coordinate breath, clear tone, and intonation on a major scale with /A/ and piano — ease, not forced volume.",
      research:
        "Slow major-scale patterns train air, onset, and pitch together — the full skill, not isolated “hit the note” practice.",
      steps: [
        "Warm with a soft fry→/A/ if helpful; pick a mid-low root (e.g. C3).",
        "Listen to the piano reference before each step.",
        "Sing a major-scale pattern on /A/ (up and down) with steady air.",
        "Avoid dumping air on the first notes of a phrase.",
        "Complete at least 3 roots; keep the same ease ascending and descending."
      ],
      tips: [
        "Technique is coordination of breath + closure + intonation together.",
        "Don’t force loudness to ‘hit’ a note — listen, then sing.",
        "Patience: the body adapts with conscious repetition.",
        "Use the highway to settle each step before moving on."
      ],
      mistakes: [
        "Spending all air at the start of the scale",
        "Forcing volume with throat",
        "Sliding through notes without centers",
        "Expecting instant results"
      ],
      metrics: [
        { id: "roots", label: "Roots completed", type: "number", target: 3, unit: "" },
        { id: "evenness", label: "Scale evenness", type: "scale", min: 1, max: 5 },
        { id: "closure", label: "Closure", type: "scale", min: 1, max: 5 },
        { id: "intonation", label: "Intonation", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, progressions: true },
      timerDefaultSec: 480,
      progressions: ["prog1", "prog3"]
    },

    /* ─── CLASS TIER (Bruno Gotelli basic course, months 1–2) ───
       Placement, resonance zones and the pre-warm-up work the class notes drill
       but the homework spine never covered. These are the spine of the prepared
       daily session (VT_STRUCTURED.singing_daily). */
    {
      id: "s17-jaw-neck-release",
      track: "singing",
      tier: "basic",
      number: 17,
      title: "Jaw & Neck Release",
      durationMin: 2,
      original:
        "Before vocalising, release the jaw and neck so they cannot interfere with placement.",
      research:
        "Muscular relaxation lowers resistance to muscle lengthening and improves the response to motor commands, so it is the standard opener before breath and placement work.",
      steps: [
        "Stand tall, shoulders down, nothing tight at the waist or the collar.",
        "Let the jaw hang: place two fingers on the hinge and let the mouth fall open with no push.",
        "Small slow circles with the head — half to one side, half to the other, never rolled back.",
        "Chew an imaginary gum with a loose tongue, lips closed, humming a soft sound.",
        "Finish with three silent pre-yawns; the inside grows, the face stays calm."
      ],
      tips: [
        "Release is not stretching — nothing here should be a strong pull.",
        "If the jaw clicks or hurts, do smaller movements only.",
        "Ending here relaxed is worth more than a bigger range today.",
        "Do this every day before the ladder — a tight jaw undoes every placement cue later."
      ],
      mistakes: [
        "Forcing the mouth open with the hands",
        "Rolling the head fully backwards",
        "Holding the breath while releasing",
        "Skipping it because it does not make sound"
      ],
      metrics: [
        { id: "phasesDone", label: "Release phases completed", labelEs: "Fases de soltura completadas", type: "number", target: 4, unit: "" },
        { id: "jawEase", label: "Jaw ease after", labelEs: "Mandíbula suelta después", type: "scale", min: 1, max: 5 },
        { id: "neckEase", label: "Neck ease after", labelEs: "Cuello suelto después", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: false, piano: false, pitchViz: false },
      timerDefaultSec: 120
    },
    {
      id: "s18-costal-breath",
      track: "singing",
      tier: "basic",
      number: 18,
      title: "Low Rib & Belly Breath (Apoyo)",
      durationMin: 4,
      original:
        "Low-rib breathing: inhale comfortably, without a deliberate breath-hold, then exhale softly and evenly.",
      research:
        "Breathing strategies vary across singers. This 4-in/6-out visual is an optional pacing cue, not a lung-function test or a uniquely proven optimal support pattern.",
      steps: [
        "Stand or sit with an easy posture and nothing tight around the waist.",
        "Put a hand on the low ribs and another on the belly; observe movement instead of pushing them outward.",
        "Inhale gently for up to 4 counts; small natural upper-chest movement is fine.",
        "Change directly to exhaling; do not hold your breath or lock your throat.",
        "Exhale softly for up to 6 counts; let the ribs return naturally instead of bracing them open.",
        "Repeat only while comfortable. If the fixed screen rhythm feels too long, ignore it and breathe naturally or stop; it cannot measure your ribs."
      ],
      tips: [
        "A quiet, comfortable breath is sufficient for this exercise; do not aim for maximum lung filling.",
        "Notes and dynamics require breath-voice coordination, not just stronger respiratory muscles.",
        "The moving rib line is an illustration, not a reading from your body.",
        "Transfer afterwards to a short, comfortable sung phrase; that is the relevant skill."
      ],
      mistakes: [
        "Forcing all movement into the belly and freezing the upper chest",
        "Holding the breath or pressing the throat between phases",
        "Overfilling until the neck tightens",
        "Rigidly keeping the ribs wide or forcing the full count when uncomfortable"
      ],
      metrics: [
        { id: "cycles", label: "Complete breath cycles", labelEs: "Ciclos de respiración completos", type: "number", target: 8, unit: "" },
        { id: "lowExpansion", label: "Low expansion (ribs/belly)", labelEs: "Expansión baja (costillas/abdomen)", type: "scale", min: 1, max: 5 },
        { id: "support", label: "Even exhale (apoyo)", labelEs: "Espiración pareja (apoyo)", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: false, piano: false, pitchViz: false },
      timerDefaultSec: 240
    },
    {
      id: "s19-soft-palate-surprise",
      track: "singing",
      tier: "basic",
      number: 19,
      title: "Soft Palate: Surprise & Pre-Yawn",
      durationMin: 4,
      original:
        "Find the soft palate with a surprised face and the instant before a yawn, then sing from that inner space.",
      research:
        "Soft-palate position changes nasal versus oral resonance. The pre-yawn image may help you explore tone colour, but it does not by itself correct pitch or guarantee a wider sound.",
      steps: [
        "Imagine you just heard surprising news — the jaw drops on its own, the space grows.",
        "Find the instant just before a yawn and stop there; that is the position, not the yawn itself.",
        "Keep that inner space and sing a comfortable /A/ — mark the hold when it feels wide.",
        "Alternate: one phrase with the space closed, one with it open. Listen to the difference.",
        "Finish on a short sung phrase you know, keeping the pre-yawn space through it."
      ],
      tips: [
        "The opening comes from surprise, not from force — a forced jaw is tension, not space.",
        "Aim for a comfortable, natural position you could hold for a whole song.",
        "More resonance is not more pressure: do not confuse resonance with pushing.",
        "A classical singer uses this obviously, pop uses it moderately — you are building the option, not one fixed sound."
      ],
      mistakes: [
        "Prying the jaw open with force",
        "Actually yawning instead of stopping before it",
        "Adding volume instead of space",
        "Letting the tongue block the exit"
      ],
      metrics: [
        { id: "openHolds", label: "Sung holds ≥1.5 s", labelEs: "Sostenidos cantados ≥1,5 s", type: "number", target: 6, unit: "" },
        { id: "openness", label: "Space / width felt", labelEs: "Espacio / amplitud que sentiste", type: "scale", min: 1, max: 5 },
        { id: "jawFree", label: "Jaw free (no tension)", labelEs: "Mandíbula libre (sin tensión)", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "C3" },
      timerDefaultSec: 240
    },
    {
      id: "s20-five-vowels",
      track: "singing",
      tier: "basic",
      number: 20,
      title: "Five Vowels (I–E–A–O–U)",
      durationMin: 5,
      original:
        "Vocalise I – E – A – O – U on one comfortable pitch, keeping the soft palate up and adjusting the shape of each vowel.",
      research:
        "Consonants join words but vowels carry the sung sound, so resonance and placement are trained on them. Each vowel needs its own opening to resonate, which is why a good /A/ does not guarantee a good /I/.",
      steps: [
        "Set the pre-yawn space from the previous exercise and keep it.",
        "On one comfortable pitch, sing I – E – A – O – U, a few seconds each.",
        "Look for the same width on every vowel — the shape changes, the space does not collapse.",
        "The closed vowels (I, U) are the hard ones: open the inside without spreading the lips.",
        "Repeat the round on two or three neighbouring pitches, never pushing the volume."
      ],
      tips: [
        "Do not simply pronounce the vowel as you do when speaking — look for the version with more room.",
        "The order I–E–A–O–U runs closed to open and back: use I to keep the sound forward and A to open it.",
        "Listen to where each vowel loses ring and fix that one on its own.",
        "Comfort and quality first, intensity later."
      ],
      mistakes: [
        "Letting the jaw close on I and U",
        "Spreading the lips sideways to reach I",
        "Changing pitch when the vowel changes",
        "Getting louder to make a vowel 'work'"
      ],
      metrics: [
        { id: "rounds", label: "Complete I–E–A–O–U rounds", labelEs: "Vueltas completas I–E–A–O–U", type: "number", target: 5, unit: "" },
        { id: "evenVowels", label: "Evenness across vowels", labelEs: "Uniformidad entre vocales", type: "scale", min: 1, max: 5 },
        { id: "space", label: "Space kept on closed vowels", labelEs: "Espacio en las vocales cerradas", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "D3" },
      timerDefaultSec: 300
    },
    {
      id: "s21-chest-resonance",
      track: "singing",
      tier: "basic",
      number: 21,
      title: "Low Notes: Chest Resonance",
      durationMin: 4,
      original:
        "Low notes with more body: aim the sound at a lower place, with the soft palate open, without pushing the voice down.",
      research:
        "Low notes benefit from a lower resonance reference and the sensation of weight near the chest. The gain comes from where the sound is aimed, not from pressing it downwards.",
      steps: [
        "Open the pre-yawn space first — the low zone still needs the soft palate.",
        "Speak a low phrase with body, for example 'Buenas noches, mucho gusto', not your everyday voice.",
        "Sing the low targets on /A/ or on that phrase, imagining the sound travelling to a lower place.",
        "Compare: the same phrase in your plain speaking voice, then with the low resonance. Keep the second.",
        "Stay in the comfortable low band; never dig for notes under it."
      ],
      tips: [
        "Imagine the direction of the sound — do not physically push the larynx down.",
        "Weight is resonance, not volume; a heavy low note that hurts is a pressed note.",
        "The soft palate is used in every zone, the low one included.",
        "If it rattles or scrapes, you have gone below your comfortable low range."
      ],
      mistakes: [
        "Pressing the voice down to fake depth",
        "Dropping the soft palate because the note is low",
        "Adding air instead of resonance",
        "Chasing notes below your comfortable range"
      ],
      metrics: [
        { id: "zoneTargets", label: "Low targets held", labelEs: "Objetivos graves sostenidos", type: "number", target: 6, unit: "" },
        { id: "body", label: "Body / weight in the low zone", labelEs: "Cuerpo / peso en la zona grave", type: "scale", min: 1, max: 5 },
        { id: "comfort", label: "Comfort (no pressing)", labelEs: "Comodidad (sin apretar)", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "A2" },
      timerDefaultSec: 240
    },
    {
      id: "s22-mid-voice-hola",
      track: "singing",
      tier: "basic",
      number: 22,
      title: "Middle Voice (\"Hola\")",
      durationMin: 3,
      original:
        "The middle zone is the one closest to everyday speech: repeat 'Hola, hola' on the given notes, natural and relaxed.",
      research:
        "The middle register sits near the pharynx and near the speaking voice, which is why it is the easiest zone to find and the best reference for how little effort singing should take.",
      steps: [
        "Say 'Hola, ¿qué tal?' the way you would to someone in the room. That is the target colour.",
        "Sing 'Hola, hola' on the middle targets with the same easy production.",
        "Do not add intention or weight — this zone is meant to feel ordinary.",
        "Alternate spoken 'Hola' and sung 'Hola' until they feel like the same voice.",
        "Keep the air calm: a short phrase should need no respiratory effort."
      ],
      tips: [
        "Singing should progress towards the ease of talking — this zone is where you feel that.",
        "If the middle feels heavy, you are carrying low-zone weight up into it.",
        "Middle is the bridge: recognising it is what stops you singing everything from one place.",
        "Explore an easy oral resonance; soft-palate position changes nasality, not pitch accuracy by itself."
      ],
      mistakes: [
        "Over-colouring a zone that should sound ordinary",
        "Carrying chest weight up into the middle",
        "Excess air pressure on short phrases",
        "Making it breathy because it feels easy"
      ],
      metrics: [
        { id: "zoneTargets", label: "Middle targets held", labelEs: "Objetivos medios sostenidos", type: "number", target: 6, unit: "" },
        { id: "speechLike", label: "Speech-like ease", labelEs: "Facilidad parecida al habla", type: "scale", min: 1, max: 5 },
        { id: "steadiness", label: "Pitch steadiness", labelEs: "Estabilidad del tono", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "D3" },
      timerDefaultSec: 180
    },
    {
      id: "s23-mask-ya",
      track: "singing",
      tier: "basic",
      number: 23,
      title: "Mask Finder (\"YA\")",
      durationMin: 3,
      original:
        "Deliberately nasal and bright 'YA, YA, YA' to locate the upper mask: nose, front of the face, sinuses, forehead.",
      research:
        "An exaggerated nasal sound is the quickest way to locate the upper resonance area. The exaggeration is the finder, not the final tone — once the place is found the sound is balanced back.",
      steps: [
        "Exaggerate on purpose: 'YA, YA, YA' as nasal and bright as you can make it.",
        "Notice buzzing sensations around the face. Treat them as a cue for tone colour, not where sound literally travels.",
        "Repeat it on rising targets keeping that same buzzing address.",
        "Once you recognise the sensation, reduce the brightness without squeezing or trying to move the sound physically.",
        "End with a couple of 'YA' rounds in a natural tone colour; compare comfort and ease."
      ],
      tips: [
        "It is supposed to sound ugly at this stage — the exercise is a finder, not the sound you will perform with.",
        "Find → stabilise → repeat → balance the colour. In that order.",
        "Loud is not the goal: the buzz appears at low volume too.",
        "If you lose the place, exaggerate again rather than pushing harder."
      ],
      mistakes: [
        "Pushing volume instead of brightness",
        "Judging the exercise by how pretty it sounds",
        "Tightening the throat to get the buzz",
        "Stopping at the exaggeration and never balancing it"
      ],
      metrics: [
        { id: "zoneTargets", label: "Mask targets held", labelEs: "Objetivos de máscara sostenidos", type: "number", target: 6, unit: "" },
        { id: "buzz", label: "Mask buzz located", labelEs: "Zumbido de máscara localizado", type: "scale", min: 1, max: 5 },
        { id: "balanced", label: "Balanced back after finding", labelEs: "Equilibraste el color después", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "G3" },
      timerDefaultSec: 180
    },
    {
      id: "s24-nana-high",
      track: "singing",
      tier: "basic",
      number: 24,
      title: "High Notes on \"NANA\"",
      durationMin: 5,
      original:
        "'NANA, NANA' on rising notes: lean on the N to keep the high placement, start soft, add intensity only once the note is stable.",
      research:
        "A high note is not a pushed middle note — it is another placement. The N carries the sound into the mask, and building the note at minimum pressure first is what stops the reflex to squeeze, over-pressurise or shout.",
      steps: [
        "Start above your comfortable middle, softer than you would ever sing it.",
        "'NANA, NANA' on each target — feel the N first, then let the A open from it.",
        "If a note does not come out, lean harder on the N and try again rather than pushing more air.",
        "Repeat each target until the body recognises the place; only then add body and volume.",
        "Finish by taking a real phrase from a song onto NANA, then back to the words."
      ],
      tips: [
        "Create the note from up there — do not drag the middle voice up to it.",
        "Position first, power second: force becomes an expressive choice, not a requirement.",
        "The chest voice has a weight limit; above it the voice must switch to a lighter coordination.",
        "Never end a session hoarse. If it scrapes, stop that target for today."
      ],
      mistakes: [
        "Pushing air to reach the note",
        "Squeezing the throat closed",
        "Turning a high note into a shout",
        "Practising a limit note over and over at full force"
      ],
      metrics: [
        { id: "zoneTargets", label: "High targets held", labelEs: "Objetivos agudos sostenidos", type: "number", target: 6, unit: "" },
        { id: "stability", label: "Pitch steadiness at soft volume", labelEs: "Estabilidad del tono a volumen suave", type: "scale", min: 1, max: 5 },
        { id: "noPush", label: "Reached without pushing", labelEs: "Llegaste sin empujar", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "G3" },
      timerDefaultSec: 300
    },
    {
      id: "s25-zone-tour",
      track: "singing",
      tier: "basic",
      number: 25,
      title: "Three-Zone Tour (Low–Mid–High)",
      durationMin: 5,
      original:
        "Walk the three resonance zones in one pass — low, middle, high — noticing how the placement changes with the height of the sound.",
      research:
        "Practising the zones separately is only the first half; the point of the month is recognising and switching between them inside real music instead of solving a whole song from one place.",
      steps: [
        "Low phase: low targets with body and the soft palate open.",
        "Middle phase: the same line near your speaking voice, no extra weight.",
        "High phase: lean on the N, light and forward, minimum pressure.",
        "Pay attention to the handover between zones — that seam is the exercise.",
        "Second pass: same tour, now trying to make the seams inaudible."
      ],
      tips: [
        "Do not sing every register from the same place — that is the habit this undoes.",
        "Find it, lose it, find it again, memorise the sensation: that repetition is how the path sticks.",
        "The point where chest hands over to a lighter coordination is the passaggio — go through it softly.",
        "If one zone is much worse than the others, give it its own exercise tomorrow rather than forcing it here."
      ],
      mistakes: [
        "Dragging chest weight through the whole tour",
        "Jumping zones with a volume increase",
        "Only ever practising the zone you like",
        "Rushing the pass — slow and controlled first"
      ],
      metrics: [
        { id: "zoneTargets", label: "Targets held across zones", labelEs: "Objetivos sostenidos en las zonas", type: "number", target: 9, unit: "" },
        { id: "transitions", label: "Smooth zone transitions", labelEs: "Transiciones suaves entre zonas", type: "scale", min: 1, max: 5 },
        { id: "comfort", label: "Comfort across the tour", labelEs: "Comodidad en todo el recorrido", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "C3" },
      timerDefaultSec: 300
    },
    {
      id: "s26-placement-compare",
      track: "singing",
      tier: "basic",
      number: 26,
      title: "Placement A/B (Compare Two Takes)",
      durationMin: 4,
      original:
        "Sing the same phrase twice — once plain, once with the placement you have been training — and listen back to the difference.",
      research:
        "The same note sung by the same person can sound completely different depending on placement, so the ear, not the feeling, is the judge. Recording and comparing is what turns a sensation into a repeatable choice.",
      steps: [
        "Pick one short phrase you know well — a line of a song, or 'Cumpleaños feliz'.",
        "Take A: sing it plainly, the way it comes out with no intention.",
        "Take B: same melody, same key, now with the open space and the placement for that zone.",
        "Play both back. Do not judge which is prettier — find which has more ring and width.",
        "Keep whichever won and note in one line what you did differently."
      ],
      tips: [
        "Record yourself to compare placements — you cannot hear this fairly from the inside.",
        "Same melody and same key in both takes, or you are comparing two different things.",
        "Do not sing along with the original artist here; it hides your own placement.",
        "A voice does not have one way to sound — you are building options to choose from."
      ],
      mistakes: [
        "Changing key or tempo between takes",
        "Singing take B louder instead of better placed",
        "Judging by prettiness instead of resonance",
        "Never listening back"
      ],
      metrics: [
        { id: "takes", label: "A/B takes recorded", labelEs: "Tomas A/B grabadas", type: "number", target: 2, unit: "" },
        { id: "audibleDiff", label: "Difference you could hear", labelEs: "Diferencia que pudiste oír", type: "scale", min: 1, max: 5 },
        { id: "preferred", label: "Placed take was better", labelEs: "La toma colocada fue mejor", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: false },
      timerDefaultSec: 240
    },
    {
      id: "s27-lip-trill-solfege",
      track: "singing",
      tier: "basic",
      number: 27,
      title: "Lip Trill Solfège (Scale on the Bubble)",
      durationMin: 5,
      original:
        "The same lip trill, now carrying a scale: 1-2-3-4-5-4-3-2-1 on the bubble, then the whole pattern moves up a semitone and you do it again.",
      research:
        "Lip trills are a semi-occluded vocal-tract exercise: acoustic interaction may make phonation feel easier. Benefits and range changes vary by singer; stop if strained. Solfège is heard in the notes while the lips trill, then explored on /A/.",
      steps: [
        "Bubble first with no pitch at all: loose lips, steady air, jaw hanging.",
        "Add the first note underneath the bubble without letting the lips stop.",
        "Trill the pattern 1-2-3-4-5-4-3-2-1 — one note per target, one breath per pattern.",
        "Breathe between patterns, never in the middle of one.",
        "After each clean pattern the root moves up a semitone; near the top it turns around and walks back down. Follow it, do not push past it.",
        "Finish by singing the last pattern on open /A/ with the same ease the bubble had."
      ],
      tips: [
        "If the lips stall, send more air rather than pressing harder — or rest two fingers on the cheeks.",
        "The buzz rate should stay the same as you climb. If it speeds up or stops, you are pushing.",
        "Keep the volume level across the pattern — getting louder on the way up is the habit this removes.",
        "A trill may feel easier near your upper comfortable range, but no fixed semitone gain is guaranteed. Stay within an easy range."
      ],
      mistakes: [
        "Letting the trill stop between notes",
        "Getting louder as the pattern rises",
        "Breathing in the middle of a pattern",
        "Chasing the top of the range instead of a clean pattern",
        "Pressing the lips together instead of sending more air"
      ],
      metrics: [
        { id: "patterns", label: "Patterns completed", labelEs: "Pasadas completas", type: "number", target: 8, unit: "" },
        { id: "trillSteady", label: "Trill steadiness", labelEs: "Estabilidad del trino", type: "scale", min: 1, max: 5 },
        { id: "pitchEase", label: "Ease of the pattern", labelEs: "Facilidad de la pasada", type: "scale", min: 1, max: 5 },
        { id: "transfer", label: "Transfer to open /A/", labelEs: "Paso a /A/ abierta", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: false, piano: true, pitchViz: true, refPitch: "C3" },
      timerDefaultSec: 300
    },
    /* ─── ADVANCED TIER (complementary singing pedagogy) ─── */
    {
      id: "s4-lip-trills",
      track: "singing",
      tier: "advanced",
      number: 4,
      title: "Lip Trills (SOVT Warm-up)",
      durationMin: 5,
      original: "Lip bubbles balance airflow and fold vibration with less strain.",
      research:
        "Semi-occluded vocal tract (lip trills) create back pressure that supports efficient phonation — standard modern warm-up.",
      steps: [
        "Relax lips; blow a steady ‘brrr’ / bubble without voice first.",
        "Add gentle pitch on the bubble — siren up and down in mid-low range.",
        "Trill on 3–5 piano notes (use sustain so each target rings 3–5s).",
        "If lips stop, use more consistent air, less press; or support cheeks lightly with fingers.",
        "Finish with same pitches on open /A/ transferring the easy feel."
      ],
      tips: [
        "Steady air wins — don’t force the lips.",
        "Keep jaw loose; think of blowing bubbles underwater.",
        "Stop if dizziness; rest between sets."
      ],
      mistakes: ["Pushing from throat", "Running out of air mid-trill", "Skipping transfer to open vowel"],
      metrics: [
        { id: "duration", label: "Minutes of trills", type: "number", target: 5, unit: "min" },
        { id: "ease", label: "Ease of phonation", type: "scale", min: 1, max: 5 },
        { id: "steadiness", label: "Trill steadiness", labelEs: "Estabilidad del trino", type: "scale", min: 1, max: 5 },
        { id: "transfer", label: "Transfer to /A/", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "C3" },
      timerDefaultSec: 300,
      progressions: ["prog1", "prog3"]
    },
    {
      id: "s5-sirens",
      track: "singing",
      tier: "advanced",
      number: 5,
      title: "Sirens / Pitch Glides",
      durationMin: 5,
      original: "Smooth glides connect registers and stretch range gently.",
      research:
        "Sirens on ng/woo help smooth passaggio and coordinate breath with pitch change without discrete jumps.",
      steps: [
        "On ‘ng’ or ‘woo’, glide from comfortable low to comfortable high and back (siren).",
        "Keep volume moderate; no cracks forced through.",
        "Do 6–8 sirens; rest between.",
        "Optional: glide to a held piano target note and park for 3–5s (sustain + visualizer)."
      ],
      tips: [
        "Think firetruck slide — smooth, not stepped.",
        "If crack, reduce volume and narrow the range.",
        "Men: don’t yank into strained high chest."
      ],
      mistakes: ["Yelling the top", "Glottal slamming at bottom", "Holding breath"],
      metrics: [
        { id: "sirens", label: "Sirens completed", type: "number", target: 8, unit: "" },
        { id: "smoothness", label: "Smoothness", type: "scale", min: 1, max: 5 },
        { id: "ease", label: "Ease", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "G2" },
      timerDefaultSec: 300
    },
    {
      id: "s6-straw",
      track: "singing",
      tier: "advanced",
      number: 6,
      title: "Straw Phonation (SOVT)",
      durationMin: 6,
      original: "Make a gentle sound through a regular drinking straw, then transfer the easy tone to a vowel.",
      research:
        "Semi-occluded vocal tract exercises can improve ease and selected voice measures, but the effect and useful resistance vary by singer; they are not a diagnosis or guaranteed range gain.",
      steps: [
        "Use a regular clean drinking straw; do not start with a very narrow coffee stirrer.",
        "Phonate a soft /u/-like tone with lips gently sealed around the straw; let air exit through it, not through the nose.",
        "Try two or three small pitch glides, staying well within an easy range.",
        "Optional water: keep the tip only about 1 cm below the surface and make gentle bubbles; stop if you feel pressure.",
        "Transfer immediately: remove the straw, sing the same pitch on /u/ then /A/ for 3–5 easy seconds."
      ],
      tips: [
        "Use a clean straw and fresh water if using bubbles; never inhale water through the straw.",
        "If airflow feels blocked or cheeks balloon, ease volume or choose a wider straw.",
        "Compare a brief sung phrase before and after; benefits are individual, not guaranteed."
      ],
      mistakes: ["Blowing only air with no voice", "Throat squeeze", "Skipping transfer to open vowels"],
      metrics: [
        { id: "minutes", label: "Comfortable straw phonation (minutes)", labelEs: "Fonación cómoda con cañita (minutos)", type: "number", target: 2, unit: "min" },
        { id: "ease", label: "Ease after transfer", type: "scale", min: 1, max: 5 },
        { id: "steadiness", label: "Air steadiness", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "C3" },
      timerDefaultSec: 360
    },
    {
      id: "s7-humming",
      track: "singing",
      tier: "advanced",
      number: 7,
      title: "Humming Resonance",
      durationMin: 5,
      original: "Humming focuses forward resonance and gentle fold contact.",
      research:
        "Humming and nasal consonants are classic resonance warm-ups; vibration on lips/mask cues efficient placement.",
      steps: [
        "Lips gently closed; hum on comfortable mid-low pitch.",
        "Feel buzz on lips/nose — not strain in neck.",
        "Hum 5 piano targets with sustain on (3–5s each).",
        "Open from hum to /m/→/A/ (m-ah) keeping the buzz feeling.",
        "Use pitch visualizer to center each hum."
      ],
      tips: [
        "Soft onset; never force the hum loud.",
        "If nasal only and stuffy, open slightly more oral space.",
        "Great before repertoire."
      ],
      mistakes: ["Clenched jaw", "Humming too high/loud", "No transfer to vowels"],
      metrics: [
        { id: "targets", label: "Pitches hummed", type: "number", target: 10, unit: "" },
        { id: "buzz", label: "Forward buzz feel", type: "scale", min: 1, max: 5 },
        { id: "transfer", label: "Hum→vowel transfer", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "D3" },
      timerDefaultSec: 300,
      progressions: ["prog1"]
    },
    {
      id: "s8-breath-support",
      track: "singing",
      tier: "advanced",
      number: 8,
      title: "Breath Support (Sustained S)",
      durationMin: 5,
      original:
        "Steady support air on unvoiced S (or SH), then the same feel on voiced /A/ — great after the SH ladder warm-up.",
      research:
        "S then /A/ is a task-specific coordination drill, not a direct measure of respiratory support. Reviews find respiratory-exercise benefits depend on individual voice needs and transfer to singing.",
      steps: [
        "Optional: warm up with a few easy SH sounds, not a maximum-duration challenge.",
        "Inhale quietly and comfortably; do not overfill or hold your breath.",
        "Exhale on a gentle 'ssss' (or SH) for about 4–6 easy seconds, then stop and rest.",
        "Repeat twice with steady comfort; the timer reports detected sound or Space input, not actual airflow.",
        "After each S, sing /A/ on a comfortable note for 4–6 seconds; compare ease and steadiness without chasing a longer hold."
      ],
      tips: [
        "Allow the ribs to move naturally; do not brace the chest or squeeze the abdomen.",
        "Start softly and end before the neck or throat begins to work hard.",
        "Transfer to one short song phrase; a longer S alone is not evidence of better singing."
      ],
      mistakes: ["Big gasp or deliberate breath-hold", "Pushing for more seconds with the neck", "Breathy or pressed /A/"],
      metrics: [
        { id: "maxS", label: "Longest comfortable S (sec; timer proxy)", labelEs: "S cómoda más larga (s; cronómetro estimado)", type: "number", target: 6, unit: "s" },
        { id: "evenness", label: "Air evenness", type: "scale", min: 1, max: 5 },
        { id: "transferA", label: "Transfer to /A/", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, refPitch: "A2", pitchViz: true },
      timerDefaultSec: 300,
      holdLogger: true
    },
    {
      id: "s9-pitch-match",
      track: "singing",
      tier: "advanced",
      number: 9,
      title: "Single-Note Pitch Match",
      durationMin: 8,
      original:
        "The piano plays a note; you match it on /A/ — listen fully first, then sing.",
      research:
        "Matching a pitch trains auditory-motor coordination. The app's pitch trace is an approximate microphone estimate: natural vibrato, accompaniment and noise can alter its 'stability' reading.",
      steps: [
        "Turn on Sustain (3–5s) and the pitch highway.",
        "Play a single reference; listen fully before you sing.",
        "Sing a soft, comfortable /A/ for about 3–4 seconds; listen first, then glance at the voice dot and target lane.",
        "For this drill, aim for a calm pitch center without holding your throat rigid; vibrato is not automatically a flaw.",
        "Try up to 8 mid-low notes with rests; stop early if the tone becomes pressed or tiring."
      ],
      tips: [
        "The ear can be trained — listen carefully before you phonate.",
        "The pitch center is different from the periodic motion of intentional vibrato; the display cannot diagnose either.",
        "Use headphones for the reference if speaker bleed distorts tracking, but keep monitoring your voice comfortably.",
        "If sharp or flat, listen again; avoid changing pitch through throat pressure.",
        "Do not fix pitch by singing louder; compare recordings at a similar distance and volume."
      ],
      mistakes: [
        "Singing before finishing listening",
        "Chasing every micro-wobble",
        "Singing louder to ‘fix’ pitch",
        "Ignoring sustain time"
      ],
      metrics: [
        { id: "matches", label: "Solid matches", type: "number", target: 8, unit: "" },
        { id: "accuracy", label: "Accuracy feel", type: "scale", min: 1, max: 5 },
        { id: "precision", label: "Precision (stability)", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "C3" },
      timerDefaultSec: 480,
      progressions: ["prog1", "prog3", "prog5"]
    },
    {
      id: "s10-five-note",
      track: "singing",
      tier: "advanced",
      number: 10,
      title: "Five-Note Scale (/A/)",
      durationMin: 8,
      original:
        "Ascending/descending 5-note patterns with closure and even air — shorter sibling of major-scale coordination.",
      research:
        "Pentascale patterns are staple coordination drills for pitch accuracy and legato in mid range.",
      steps: [
        "Choose starting pitch in mid-low male range (e.g. C3).",
        "Listen to the piano step, then sing 1-2-3-4-5-4-3-2-1 on /A/.",
        "Use arpeggio or sustain modes as needed.",
        "Keep same volume and closure ascending and descending.",
        "Repeat starting on 3 different roots."
      ],
      tips: [
        "Don’t push the top note — lighter if needed.",
        "Visualizer: each step should settle near the line before moving on.",
        "Legato: connect notes with air, not glottal hits.",
        "For full major-scale focus see Major Scale Coordination (basic)."
      ],
      mistakes: ["Yelling the 5th", "Sliding through all notes without centers", "Breathless rush"],
      metrics: [
        { id: "roots", label: "Roots practiced", type: "number", target: 3, unit: "" },
        { id: "evenness", label: "Scale evenness", type: "scale", min: 1, max: 5 },
        { id: "closure", label: "Closure", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, progressions: true },
      timerDefaultSec: 480,
      progressions: ["prog1", "prog3"]
    },
    {
      id: "s11-dynamics",
      track: "singing",
      tier: "advanced",
      number: 11,
      title: "Dynamic Swells on One Note",
      durationMin: 6,
      original: "Crescendo/decrescendo on a sustained pitch without pitch drift.",
      research:
        "Messa di voce–style control builds dynamic skill while testing pitch stability under changing intensity.",
      steps: [
        "Pick one comfortable pitch (piano + sustain + visualizer).",
        "Start soft → swell to medium → back to soft over ~6–8 seconds.",
        "Keep pitch center (the pitch line under the swell stays flat).",
        "Do 6 swells; rest if pressed.",
        "Optional: same on two nearby pitches."
      ],
      tips: [
        "Volume change from support, not throat squeeze.",
        "If pitch goes sharp when loud, reduce press.",
        "Precision band should stay reasonably narrow."
      ],
      mistakes: ["Shouting the peak", "Pitch riding up with volume", "Running out of air mid-swell"],
      metrics: [
        { id: "swells", label: "Swells completed", type: "number", target: 6, unit: "" },
        { id: "pitchStable", label: "Pitch stability", type: "scale", min: 1, max: 5 },
        { id: "dynamicControl", label: "Dynamic control", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "D3" },
      timerDefaultSec: 360
    },
    {
      id: "s12-easy-onset",
      track: "singing",
      tier: "advanced",
      number: 12,
      title: "Easy Onset Coordination",
      durationMin: 5,
      original: "Start tone without glottal slam or breathy h.",
      research:
        "Balanced onset (not hard glottal, not aspirate) is core healthy phonation; fry→tone can assist finding it.",
      steps: [
        "Practice silent inhale, then easy /A/ as if continuing a thought.",
        "Contrast: 2 hard glottal ‘uh’ (too pressed) vs 2 breathy ‘ha’ (too airy) vs 2 easy onsets.",
        "Match piano pitch with easy onset; hold 3–5s (sustain).",
        "10 easy onsets across a few pitches."
      ],
      tips: [
        "Think ‘speak the vowel’ more than ‘attack the note’.",
        "Fry can locate closure, then immediately ease into tone.",
        "Visualizer should show quick settle, not wild attack spike only."
      ],
      mistakes: ["Hard glottal punches", "Chronic breathy starts", "Tension in jaw/tongue"],
      metrics: [
        { id: "easyOnsets", label: "Easy onsets", type: "number", target: 10, unit: "" },
        { id: "balance", label: "Onset balance", type: "scale", min: 1, max: 5 },
        { id: "comfort", label: "Comfort", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "C3" },
      timerDefaultSec: 300
    },
    {
      id: "s13-arpeggio-match",
      track: "singing",
      tier: "advanced",
      number: 13,
      title: "Arpeggio Pitch Match",
      durationMin: 10,
      original: "Sing chord tones (1-3-5-8) with piano arpeggios in male mid-low range.",
      research:
        "Broken-chord patterns train interval accuracy and ear–voice coordination used in baritone warm-ups.",
      steps: [
        "Enable Arpeggio + Sustain (or longer chord spacing).",
        "Sing root–third–fifth–octave (as comfortable) on /A/ or solfège.",
        "Watch visualizer settle on each chord tone.",
        "Do all 5 progressions once slowly, then once flowing.",
        "Prefer comfort over full octave if strained."
      ],
      tips: [
        "Skip high octave if not free — use 1-3-5 only.",
        "Hear the piano chord tone before you sing it.",
        "Precision improves when you wait the full sustain window."
      ],
      mistakes: ["Racing the arpeggio", "Sliding past chord tones", "Forcing top notes"],
      metrics: [
        { id: "progressions", label: "Progressions completed", type: "number", target: 5, unit: "" },
        { id: "intervalAccuracy", label: "Interval accuracy", type: "scale", min: 1, max: 5 },
        { id: "ease", label: "Ease", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, progressions: true, pitchViz: true },
      timerDefaultSec: 600,
      progressions: [
        "prog1",
        "prog2",
        "prog3",
        "prog4",
        "prog5",
        "progJump1",
        "progJump2",
        "progJump3",
        "progJump4"
      ]
    },
    {
      id: "s14-staccato-legato",
      track: "singing",
      tier: "advanced",
      number: 14,
      title: "Staccato vs Legato Control",
      durationMin: 7,
      original: "Alternate short articulated notes and connected lines on the same pitches.",
      research:
        "Contrasting articulation builds fold agility and breath management used across contemporary and classical styles.",
      steps: [
        "On a 3-note pattern, sing staccato (short, easy, not punched).",
        "Same pattern legato (connected, even air).",
        "Alternate 4 rounds with piano reference.",
        "Keep pitch center in both modes (use visualizer).",
        "Finish with 30s of your favorite song phrase legato only."
      ],
      tips: [
        "Staccato = bounce of air, not throat slap.",
        "Legato = constant small air stream.",
        "If staccato goes sharp, lighten."
      ],
      mistakes: ["Glottal staccato hammers", "Legato that smears pitch", "No rest between rounds"],
      metrics: [
        { id: "rounds", label: "Contrast rounds", type: "number", target: 4, unit: "" },
        { id: "staccatoEase", label: "Staccato ease", type: "scale", min: 1, max: 5 },
        { id: "legatoLine", label: "Legato line", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: true, progressions: true },
      timerDefaultSec: 420,
      progressions: ["prog1", "prog3"]
    },
    {
      id: "s28-vocal-function",
      track: "singing",
      tier: "advanced",
      number: 28,
      title: "Vocal Function on Notes",
      durationMin: 7,
      original: "One long note, two glides and five held notes, all of it soft.",
      research:
        "The Vocal Function Exercises (Stemple et al., 1994) are four soft exercises done twice each, twice a day, for about six weeks. In healthy voices, singers included, they lengthened how long people could sustain a sound in small controlled trials (Stemple et al., 1994; Sabol et al., 1995, 20 singers; Bane et al., 2019), and a systematic review of 21 studies reported no adverse effects (Angadi et al., 2019). What improves is the trained task itself: nobody has shown that it makes singing sound better, and it does not promise range. The clinic sets a personal time goal from lung volume; this app cannot, so the rule here is “as long as it stays easy”.",
      steps: [
        "Stand tall. Everything here is as soft as you can sing with the tone still clear.",
        "Long note: the piano gives a note; sing a soft, bright “ee” on it for as long as it stays easy. Stop before you squeeze. Twice.",
        "Glide up: lips rounded and almost closed on “oh”, slide slowly from your lowest easy note to your highest easy note. Twice.",
        "Glide down: the same shape, from high to low. Twice.",
        "Five notes: the piano gives five notes going up, one at a time. Hold a soft “oh” on each for as long as it stays easy, twice."
      ],
      tips: [
        "If the notes sit too high or too low, move the octave before you start: the exercise should feel comfortable, not textbook.",
        "The dose the studies used: each exercise twice, twice a day, for six weeks. Doing each only once per session was not enough in one of them.",
        "Stop if you feel pain or burning, or end up hoarser than you started."
      ],
      mistakes: ["Holding on until the throat squeezes", "Loud instead of soft", "Opening the lips wide on “oh”"],
      metrics: [
        { id: "longHolds", label: "Notes of 3 s or more (heard)", labelEs: "Notas de 3 s o más (oídas)", type: "number", target: 10, unit: "" },
        { id: "longestHold", label: "Longest easy note, in seconds (heard)", labelEs: "Nota cómoda más larga, en segundos (oída)", type: "number", target: 10, unit: "s" },
        { id: "easyVoice", label: "Easy voice, no squeeze", labelEs: "Voz cómoda, sin apretar", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, pitchViz: false, refPitch: "F3" },
      timerDefaultSec: 420
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
  "Vocal closure (singing)",
  "Strategic pause",
  "Pitch accuracy",
  "Pitch precision / stability",
  "Authority cadence",
  "Energy calibration"
];

/**
 * The exercises that train each week element, per track, in the order the Plan
 * lists them once the element is picked. Keys are the stored English names
 * above. Editorial: an element lists the other track's exercises only where
 * they train the same thing (breathing is breathing whether you speak or sing).
 */
window.VT_WEEK_ELEMENT_EXERCISES = {
  Volume: { vocal: ["v2-volume", "v13-volume-ladder"] },
  Tonality: { vocal: ["v12-melodic-speech"] },
  "Facial expression": { vocal: ["v16-facial-expression"] },
  Diction: { vocal: ["v1-diction", "v4-articulation-pen"] },
  // v1 cycles reading rates 5 to 8, so it trains rate control as well.
  "Pace / rate control": { vocal: ["v14-pace-variation", "v1-diction"] },
  // v7's delayed review is where fillers get counted.
  "Filler reduction": { vocal: ["v11-kill-fillers", "v7-record-review"] },
  "Gestures / body language": { vocal: ["v15-gestures"] },
  "Story structure": { vocal: ["v18-story-peak", "v5-neutral-ears"] },
  "Resonance / soft palate": {
    vocal: ["v3-soft-palate"],
    singing: ["s19-soft-palate-surprise", "s23-mask-ya", "s7-humming"]
  },
  "Connection questions": { vocal: ["v6-connect"] },
  "Breath support": {
    vocal: ["v2-volume", "s18-costal-breath"],
    singing: ["s18-costal-breath", "s15-sh-air-ladder", "s8-breath-support"]
  },
  "Vocal closure (singing)": { singing: ["s1-vocal-fry", "s12-easy-onset"] },
  "Strategic pause": { vocal: ["v10-power-pause", "v17-strategic-concision"] },
  "Pitch accuracy": { singing: ["s9-pitch-match", "s10-five-note", "s16-major-scale-coord"] },
  "Pitch precision / stability": { singing: ["s11-dynamics", "s2-solfege-chords", "s13-arpeggio-match"] },
  "Authority cadence": { vocal: ["v19-authority-close"] },
  "Energy calibration": { vocal: ["v20-energy-match"] }
};

/**
 * The elements the Plan offers first on each track, in this order; the rest
 * wait behind "Ver otros". Seventeen equal chips put a singer through twelve
 * public-speaking ones before reaching theirs.
 */
window.VT_WEEK_ELEMENTS_FIRST = {
  vocal: ["Volume", "Diction", "Pace / rate control", "Filler reduction", "Strategic pause", "Tonality"],
  singing: [
    "Breath support",
    "Vocal closure (singing)",
    "Pitch accuracy",
    "Resonance / soft palate",
    "Pitch precision / stability"
  ]
};

window.VT_STRUCTURED = {
  vocal_basic: [
    "v1-diction",
    "v2-volume",
    "v3-soft-palate",
    "v4-articulation-pen",
    "v5-neutral-ears",
    "v6-connect",
    "v7-record-review",
    "v8-fluency-metaphors",
    "v9-12-week"
  ],
  vocal_advanced: [
    "v10-power-pause",
    "v11-kill-fillers",
    "v12-melodic-speech",
    "v13-volume-ladder",
    "v14-pace-variation",
    "v15-gestures",
    "v16-facial-expression",
    "v17-strategic-concision",
    "v18-story-peak",
    "v19-authority-close",
    "v20-energy-match"
  ],
  vocal_full: null, // filled below
  singing_basic: [
    "s15-sh-air-ladder",
    "s1-vocal-fry",
    "s16-major-scale-coord",
    "s2-solfege-chords",
    "s3-song-stanzas"
  ],
  singing_advanced: [
    "s4-lip-trills",
    "s5-sirens",
    "s6-straw",
    "s7-humming",
    "s8-breath-support",
    "s9-pitch-match",
    "s10-five-note",
    "s11-dynamics",
    "s12-easy-onset",
    "s13-arpeggio-match",
    "s14-staccato-legato"
  ],
  singing_full: null,

  /**
   * Prepared daily session — the class sequence, in order, in one press.
   * Release → breath → SOVT warm-ups → closure → placement → the three
   * resonance zones → application. Steps carry their own short timer
   * (see DAILY_SEC) so the whole run is ~30 minutes rather than the sum of
   * each exercise's own full-length default.
   */
  singing_daily: [
    "s17-jaw-neck-release",
    "s18-costal-breath",
    "s15-sh-air-ladder",
    "s7-humming",
    "s4-lip-trills",
    "s27-lip-trill-solfege",
    "s1-vocal-fry",
    "s19-soft-palate-surprise",
    "s20-five-vowels",
    "s2-solfege-chords",
    "s21-chest-resonance",
    "s22-mid-voice-hola",
    "s23-mask-ya",
    "s24-nana-high",
    "s25-zone-tour",
    "s26-placement-compare",
    "s3-song-stanzas"
  ]
};

/** Per-step timer (seconds) for the prepared daily session. */
window.VT_DAILY_SESSION = {
  id: "singing_daily",
  track: "singing",
  path: "daily",
  totalMin: 32,
  sec: {
    "s17-jaw-neck-release": 105,
    "s18-costal-breath": 105,
    "s15-sh-air-ladder": 120,
    "s7-humming": 90,
    "s4-lip-trills": 120,
    "s27-lip-trill-solfege": 120,
    "s1-vocal-fry": 90,
    "s19-soft-palate-surprise": 150,
    "s20-five-vowels": 120,
    "s2-solfege-chords": 120,
    "s21-chest-resonance": 105,
    "s22-mid-voice-hola": 75,
    "s23-mask-ya": 75,
    "s24-nana-high": 90,
    "s25-zone-tour": 135,
    "s26-placement-compare": 120,
    "s3-song-stanzas": 180
  }
};

window.VT_STRUCTURED.vocal_full = window.VT_STRUCTURED.vocal_basic.concat(
  window.VT_STRUCTURED.vocal_advanced
);
window.VT_STRUCTURED.singing_full = window.VT_STRUCTURED.singing_basic.concat(
  window.VT_STRUCTURED.singing_advanced
);

/** Backward-compatible keys used by older session code */
window.VT_STRUCTURED.vocal = window.VT_STRUCTURED.vocal_basic;
window.VT_STRUCTURED.singing = window.VT_STRUCTURED.singing_basic;
