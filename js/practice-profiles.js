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
      cue: "Over-articulate the same page. Rate phases advance automatically.",
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
      cue: "Keep energy even from 1→10. Watch the volume lane — avoid fading at the end.",
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
      metricHints: {}
    },
    "v4-articulation-pen": {
      mode: "articulationContrast",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        { label: "With pen · count 1–60", sec: 90 },
        { label: "Pen off · feel the ease", sec: 45 }
      ],
      cue: "Phase 1: pen in mouth. Phase 2: remove pen and notice clarity.",
      metricHints: {}
    },
    "v5-neutral-ears": {
      mode: "recordOnly",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Deliver persona + story. Recording starts with practice — review later with neutral ears.",
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
      cue: "Aim for more listening than speaking. Silence ratio is a friend.",
      metricHints: { presence: "listenBias" }
    },
    "v7-record-review": {
      mode: "reviewSession",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Record 5–10 min improv. Leave one full day before the 3-step review.",
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
      cue: "Open the 12-week dashboard — one element, daily check-ins, weekly record/review.",
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
      metricHints: { pauseCount: "pauseEvents" }
    },
    "v11-kill-fillers": {
      mode: "pauseDetect",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      minPauseSec: 0.7,
      cue: "When ‘um’ rises, close your mouth and pause instead. Silence events = wins.",
      metricHints: { replacement: "pauseEventsScale" }
    },
    "v12-melodic-speech": {
      mode: "pitchContour",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Use pitch range for musical speech — variety, not note-matching drills.",
      metricHints: { variety: "pitchRangeScale" }
    },
    "v13-volume-ladder": {
      mode: "volumeLadder",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      ladder: [
        { label: "1 Whisper", target: 0.12 },
        { label: "2 Soft", target: 0.22 },
        { label: "3 Conversational", target: 0.35 },
        { label: "4 Projected", target: 0.5 },
        { label: "5 Full room", target: 0.65 }
      ],
      stepSec: 8,
      cue: "Climb whisper → full room without strain. Match each level’s target band.",
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
      cue: "Tap “Key point” when you slow down for impact. Log 3 intentional slow-downs.",
      metricHints: { keySlowdowns: "keyPoints" }
    },
    "v15-gestures": {
      mode: "gestureReps",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "3 gesture types: size · count · location. Record, then review muted first.",
      metricHints: {}
    },
    "v16-facial-expression": {
      mode: "recordOnly",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Curiosity → surprise → resolve on your face. Record and review muted video.",
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
      cue: "Receive → breathe (~2.5s silence) → answer in ≤3 sentences.",
      metricHints: { questions: "questionCount", pauseBefore: "gateSuccess" }
    },
    "v18-story-peak": {
      mode: "storyTimer",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        { label: "Setup", sec: 40 },
        { label: "Peak emotion", sec: 50 },
        { label: "Point / takeaway", sec: 30 }
      ],
      cue: "Setup short · peak vivid · land the point. Mark peak when you hit it.",
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
      metricHints: { landed: "landCount" }
    },
    "v20-energy-match": {
      mode: "volumeLadder",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      ladder: [
        { label: "Low energy", target: 0.2 },
        { label: "Medium energy", target: 0.38 },
        { label: "High energy", target: 0.58 }
      ],
      stepSec: 30,
      cue: "Same message, three energies. Match the band, stay authentic.",
      metricHints: { flexibility: "ladderCycles" }
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
      cue: "Fry → clear /A/. Hold ≥2s logs automatically. No note-challenge game.",
      metricHints: { maxHold: "bestHold" }
    },
    "s2-solfege-chords": {
      mode: "pitchChord",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Sing /A/ on chord tones. Piano loops with sustain. Track reps toward 25.",
      metricHints: { reps: "repCount" }
    },
    "s3-song-stanzas": {
      mode: "pitchSong",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: true,
      cue: "Stanzas under song progressions. Change pitch every couple of words — not challenge mode.",
      metricHints: {}
    },
    /* —— Singing advanced —— */
    "s4-lip-trills": {
      mode: "sovtFlow",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Steady air for lip bubbles. Evenness bar rewards consistent flow — not pitch scores.",
      metricHints: { ease: "steadyAir" }
    },
    "s5-sirens": {
      mode: "sirenRange",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      cue: "Smooth glides. We track pitch range rope and siren count — not single-note locks.",
      metricHints: { sirens: "sirenCount", smoothness: "rangeSmooth" }
    },
    "s6-straw": {
      mode: "sovtFlow",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Phonate through straw with steady air. Transfer to open vowels after.",
      metricHints: { steadiness: "steadyAir" }
    },
    "s7-humming": {
      mode: "pitchHold",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "D3",
      cue: "Gentle hum on targets. Soft holds — no aggressive challenge scoring.",
      metricHints: { targets: "holdCount" }
    },
    "s8-breath-support": {
      mode: "breathS",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Phase 1: even S (air only). Phase 2: transfer same support to /A/.",
      metricHints: { maxS: "bestS", transferA: "bestA" }
    },
    "s9-pitch-match": {
      mode: "pitchMatch",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: true,
      autoPiano: true,
      autoRecord: false,
      cue: "Lock 8 notes in the green lane. Score + combo — full pitch game.",
      metricHints: { matches: "locks", accuracy: "gameAccuracy", precision: "gameCombo" }
    },
    "s10-five-note": {
      mode: "scaleSteps",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "1–2–3–4–5–4–3–2–1 step targets. Short lock per step, not free challenge.",
      metricHints: { roots: "rootCount" }
    },
    "s11-dynamics": {
      mode: "dynamicSwell",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Swell soft→medium→soft. Watch pitch stay stable while level moves.",
      metricHints: { swells: "swellCount", pitchStable: "pitchStableScale" }
    },
    "s12-easy-onset": {
      mode: "onsetReps",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      targetReps: 10,
      cue: "Easy onsets only. We flag hard attacks (RMS spikes) vs balanced starts.",
      metricHints: { easyOnsets: "easyOnsetCount" }
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
      cue: "Arpeggio + sustain. Match chord tones as they roll.",
      metricHints: { progressions: "repCount" }
    },
    "s14-staccato-legato": {
      mode: "articulationContrast",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      phases: [
        { label: "Staccato rounds", sec: 90 },
        { label: "Legato line", sec: 90 },
        { label: "Staccato again", sec: 60 },
        { label: "Legato again", sec: 60 }
      ],
      cue: "Alternate short bounce vs connected line. Hold log helps hear the difference.",
      metricHints: { rounds: "phaseCount" }
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
            cue: "Start practice to begin."
          };
        }
      });
    });
  }

  applyProfiles();
  global.VT_PRACTICE_PROFILES = P;
  global.VTApplyPracticeProfiles = applyProfiles;
})(window);
