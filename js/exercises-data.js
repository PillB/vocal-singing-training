/**
 * Enhanced exercise library — Vocal (Vinh Giang) + Singing (LMS + complementary)
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
      research: "Vinh Giang foundations: over-articulation builds clarity range so everyday speech lands cleaner.",
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
      research: "Volume signals confidence and authority (Vinh Giang communication series).",
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
      research: "Resistance articulation drills strengthen speech muscles for clearer delivery.",
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
      tier: "basic",
      number: 5,
      title: "Neutral Ears (Persona & Story)",
      durationMin: 15,
      original:
        "Prepare a persona: motivador, coach, friend, educator and try it out with a stranger. Begin with a compliment. Also prepare and test a story. Review and improve.",
      research: "Persona flexibility + story practice builds adaptive presence (Vinh Giang STAGE-style work).",
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
            "Any distracting habits?"
          ]
        },
        {
          id: "transcription",
          title: "3 · Transcription review",
          prompts: [
            "Transcribe a 1–2 minute excerpt.",
            "Highlight fillers: um, like, you know…",
            "Mark unclear or run-on sentences.",
            "Choose ONE pattern to improve next week."
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

    /* ─── ADVANCED TIER (Vinh Giang theory expansions) ─── */
    {
      id: "v10-power-pause",
      track: "vocal",
      tier: "advanced",
      number: 10,
      title: "Power of the Pause",
      durationMin: 8,
      original: "Research expansion from Vinh Giang: strategic silence for processing, authority, and fewer fillers.",
      research:
        "Vinh Giang: pauses give listeners time to process, give you time to think, and replace um/uh with intentional silence — increasing clarity, authority, and credibility.",
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
      original: "When you feel um/ah rising, pause instead (Vinh Giang filler replacement).",
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
        "Vinh Giang stresses tonality as a vocal foundation; monotony loses attention. Musical variety (ups, downs, color) keeps listeners engaged.",
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
      audio: { timer: true, record: true, piano: true, pitchViz: true, refPitch: "C3" },
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
        "Pick one sentence (8–12 words).",
        "Say it at level 1 (almost whisper) → 2 soft → 3 conversational → 4 projected → 5 full room (not shout).",
        "Return 5 → 3 → 1 with the same sentence.",
        "Then deliver a 60s story using at least 3 different volume levels on purpose."
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
      original: "Slow down on points that matter; speed can create energy, slow creates weight (Vinh Giang pace tools).",
      research:
        "Varying pace keeps audiences engaged. Slow on key ideas; allow processing time; avoid one-speed delivery.",
      steps: [
        "Write 3 key points for a short talk.",
        "Deliver with deliberate slow-down on each key point (+ pause after).",
        "Use slightly faster pace on transitions/setup.",
        "Record 90 seconds and mark where pace served meaning."
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
        "Vinh Giang record-review emphasizes hand gestures and body language as equal to vocal foundations.",
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
      original: "Vinh Giang concise method: receive → breathe → refine → share.",
      research:
        "vinhgiang.com: speak clearly and concisely by embracing the pause — receive the question, breathe, refine the thought, then share.",
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
      original: "Storytelling secret: focus on the peak emotion or action (Vinh Giang workshop themes).",
      research:
        "Memorable stories emphasize the peak emotional turn, not every detail. Setup is short; the turn is vivid; the point is clear.",
      steps: [
        "Choose a true 2-minute personal story.",
        "Write: setup (2–3 sentences) → peak moment (sensory detail) → point (1 sentence).",
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

    /* ─── SINGING track continues below in singing array ─── */
  ],

  singing: [
    /* ─── BASIC TIER (Live Music School homework) ─── */
    {
      id: "s1-vocal-fry",
      track: "singing",
      tier: "basic",
      number: 1,
      title: "Vocal Fry → Sustained /A/",
      durationMin: 5,
      original:
        "Breath in 3s; vocal fry on A with closure + air dosing; transition to clean A; hold max; log; try +1–2s; 5 min.",
      research: "Live Music School: fry finds closure; sustained /A/ trains dosed air without breathiness.",
      steps: [
        "Inhale gently for 3 seconds.",
        "Start a gentle vocal fry on /A/ (creaky-door feel).",
        "Transition smoothly to a clear speaking-pitch /A/ with steady air.",
        "Hold as long as comfortable; log the seconds.",
        "Rest; repeat aiming for +1–2 seconds. About 5 minutes total."
      ],
      tips: [
        "Fry is a finder for closure, not the artistic goal.",
        "Men: start around comfortable speaking pitch (A2–D3).",
        "Hydrate; moderate volume; stop if strain."
      ],
      mistakes: ["Pushing fry hard", "Breathy floating tone", "Throat squeeze on the hold"],
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
      title: "Song Stanzas (Feel / Better Man)",
      durationMin: 20,
      original:
        "Two stanzas of Feel and Better Man in solfège, note changes every couple of words, ×5 each song.",
      research: "Transfer closure + air skills into repertoire with flexible progressions.",
      steps: [
        "Use two stanzas you know from Feel and Better Man.",
        "Speak → speak-on-pitch → sing.",
        "Change pitch every couple of words with piano underneath.",
        "5 reps each song; mix song-friendly and alternate progressions.",
        "Use Sustain + pitch graph to settle each target note."
      ],
      tips: [
        "Never sacrifice closure for melody.",
        "Mid-lower keys protect the voice while building skill."
      ],
      mistakes: ["Pushing chest too high", "Only memorizing pitch without closure"],
      metrics: [
        { id: "repsFeel", label: "Feel reps", type: "number", target: 5, unit: "" },
        { id: "repsBetter", label: "Better Man reps", type: "number", target: 5, unit: "" },
        { id: "accuracy", label: "Note accuracy (self)", type: "scale", min: 1, max: 5 },
        { id: "closure", label: "Closure quality", type: "scale", min: 1, max: 5 }
      ],
      audio: { timer: true, record: true, piano: true, progressions: true, songs: true, pitchViz: true },
      timerDefaultSec: 1200,
      songs: [
        { id: "feel", title: "Feel — Robbie Williams", keyHint: "Male mid-low friendly key", prog: "songFeel" },
        { id: "better", title: "Better Man — Robbie Williams", keyHint: "Male mid-low friendly key", prog: "songBetter" }
      ]
    },

    /* ─── ADVANCED TIER (complementary singing pedagogy) ─── */
    {
      id: "s4-lip-trills",
      track: "singing",
      tier: "advanced",
      number: 4,
      title: "Lip Trills (SOVT Warm-up)",
      durationMin: 5,
      original: "Complementary SOVT: lip bubbles balance airflow and fold vibration with less strain.",
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
      original: "Phonate through a narrow straw for efficient fold vibration and easy onset.",
      research:
        "Straw phonation is a core SOVT tool used in voice therapy and singing pedagogy to reduce phonatory effort and improve resonance balance.",
      steps: [
        "Use a drinking straw (or coffee stirrer for more resistance).",
        "Sustain a comfortable pitch into the straw — air only through straw, cheeks soft.",
        "Glide gently up and down through the straw.",
        "Optional: straw in water for bubble feedback (steady bubbles = steady air).",
        "Transfer: remove straw, sing same pitch on /u/ then /A/ with same easy feel."
      ],
      tips: [
        "No cheek puffing battles — soften and reduce pressure.",
        "If blocked, widen straw or ease volume.",
        "Great reset mid-practice if voice feels pressed."
      ],
      mistakes: ["Blowing only air with no voice", "Throat squeeze", "Skipping transfer to open vowels"],
      metrics: [
        { id: "minutes", label: "Minutes through straw", type: "number", target: 5, unit: "min" },
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
      original: "Train steady appoggio-style air with silent then voiced sustain.",
      research:
        "Steady airflow underpins non-breathy tone. Unvoiced S/hiss drills isolate support before adding phonation.",
      steps: [
        "Inhale 3 counts (low, quiet expansion).",
        "Exhale on a steady ‘ssss’ as long as even — not blasts.",
        "Log seconds of even S. Rest. Repeat 5 times aiming +1–2s.",
        "Then: same inhale → sustained /A/ with same steady air feel.",
        "Compare: is the /A/ as even as the S?"
      ],
      tips: [
        "Ribs stay buoyant; don’t collapse chest at the end.",
        "Start softer to finish even.",
        "Pair with hold logger on the voiced set."
      ],
      mistakes: ["Big gasp inhale", "Pushing last air with neck", "Breathy dump on /A/"],
      metrics: [
        { id: "maxS", label: "Longest even S (sec)", type: "number", target: 20, unit: "s" },
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
      original: "Home in on one target at a time with eyes + ears (visual equalizer).",
      research:
        "Pitch-matching drills with sustained reference tones help beginners lock frequency; visual feedback accelerates accuracy and precision.",
      steps: [
        "Turn on Sustain (3–5s) and Pitch visualizer.",
        "Play a single reference (or slow progression).",
        "Sing the target; watch your voice dot vs glowing target trail.",
        "Aim: voice dot near center AND narrow soft deviation band (precision).",
        "Log 8 successful matches across mid-low notes."
      ],
      tips: [
        "Accuracy = average near target; precision = low wobble.",
        "If sharp/flat, adjust with small mental ‘lift/drop’ not throat shove.",
        "Quiet practice room helps the detector."
      ],
      mistakes: ["Chasing every micro-wobble", "Singing louder to ‘fix’ pitch", "Ignoring sustain time"],
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
      original: "Ascending/descending 5-note patterns with closure and even air.",
      research:
        "Pentascale patterns are staple coordination drills for pitch accuracy and legato in mid range.",
      steps: [
        "Choose starting pitch in mid-low male range (e.g. C3).",
        "Sing 1-2-3-4-5-4-3-2-1 on /A/ with piano reference.",
        "Use arpeggio or sustain modes as needed.",
        "Keep same volume and closure ascending and descending.",
        "Repeat starting on 3 different roots."
      ],
      tips: [
        "Don’t push the top note — lighter if needed.",
        "Visualizer: each step should settle near the line before moving on.",
        "Legato: connect notes with air, not glottal hits."
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
        "Keep pitch center (watch the dots stay aligned).",
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
  singing_basic: ["s1-vocal-fry", "s2-solfege-chords", "s3-song-stanzas"],
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
  singing_full: null
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
