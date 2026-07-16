# Phase 8 — Final Delivery Report

**Project:** Vocal & Singing Training 
**Date:** 2026-07-15 
**Source homework:** `Vocal training and Singing training Homework.md`

---

## 1. Research summary

### Prompt engineering & multi-agent practice
- Phase preambles, separation of concerns, evidence requirements, critic loops (validate → fix → re-validate), and structured retrospection/gap registries.
- GLM-5.x agentic insights: long-horizon task completion, strong HTML/CSS generation, interleaved reasoning style, prefer simple static stacks for reliability.

### Vocal / singing platforms
- Patterns from pitch-training apps (reference audio, record/review, non-judgmental metrics).
- speaking pedagogy homework spine: diction, volume, soft palate, pen articulation, persona/story, connection, record-review, metaphors, 12-week focus.
- singing pedagogy spine: fry→closure→/A/ hold; solfège on progressions; song stanzas with note changes.
- Male mid-lower piano range (C2–E4) for baritone-friendly practice.

---

## 2. Enhanced exercises

Full library: [`02-EXERCISE-LIBRARY.md`](./02-EXERCISE-LIBRARY.md) and runtime data in `js/exercises-data.js`.

| ID | Title | Metrics highlight | Audio |
|----|-------|-------------------|-------|
| V1–V8 | Diction → Metaphors | Clarity, consistency, fillers, etc. | Timer + record where useful |
| V7 | Record & Review | 3-step checklist | Required record + review UI |
| V9 | 12-week plan | Days practiced, improvement | Dashboard integration |
| S1 | Fry → /A/ | Max hold seconds | Ref A2 + inhale ticks + hold log |
| S2 | Solfège chords | 25 reps targets | 5 piano progressions |
| S3 | user songs | Reps + accuracy | Song-friendly progressions |

---

## 3. Key design decisions

| Decision | Rationale |
|----------|-----------|
| Vanilla SPA, no build | GitHub Pages simplicity, reliability |
| IndexedDB for audio | localStorage too small for recordings |
| Self-rubric scores 0–10 | Transparent, non-judgmental, offline |
| Additive piano synth | Realistic enough chords without large samples |
| Relative paths | Works on user/repo Pages URLs |
| No full song lyrics | Copyright-safe; user supplies known stanzas |

---

## 4. Technical notes

- **Piano:** multi-partial sine/triangle + noise hammer, compressor, slight arpeggiation option (`js/piano.js`).
- **Progressions:** C/Am/F/G family and G/Em/C/D, F/C/Dm/Bb, Dm/Bb/F/C; song keys for user songs practice.
- **Session:** `VTSession` pause/resume/clear in localStorage.
- **Recorder:** MediaRecorder + level meter via AnalyserNode.

---

## 5. Validation (Phase 6)

Playwright suite `tests/validation.spec.js` — **10/10 passed**:

1. Two tabs + exercise counts (9 vocal / 3 singing) 
2. Exercise content (steps, tips, metrics, timer) 
3. Structured session start / pause / resume / end 
4. Piano controls on solfège exercise 
5. Hold logger + reference pitch on vocal fry 
6. Record & Review 3-step UI 
7. Metrics save → score display 
8. 12-week plan start / check-in / improved 
9. History view 
10. Homework MD link reachable 

### Issues found & fixed during build
- Initial gap: need secure context for mic — documented (localhost/HTTPS).
- Song lyric risk — mitigated with practice prompts only.
- No blocking test failures after implementation round.

---

## 6. Success criteria checklist

- [x] Two main tabs (Vocal / Singing) 
- [x] Individual + structured sessions with pause/resume 
- [x] Recording + audit/history 
- [x] Exercise-specific metrics with explanations 
- [x] Research-backed tips preserving original spirit 
- [x] Audio listening/generation (piano chords, ref pitch) 
- [x] 12-week plan logic functional 
- [x] Usable production-ready static site 
- [x] Evidence/docs for phases 
- [x] Playwright validation green 
- [x] GitHub Pages deploy 
- [x] Male mid-lower piano chords 

---

## 7. Future improvements

1. Optional WebAudio pitch detection (autocorrelation) for soft pitch feedback. 
2. Optional cloud sync / multi-device progress. 
3. Downloadable weekly PDF reports. 
4. Sample-based Salamander piano for even more realism. 
5. Accessibility audit (screen reader walkthrough). 
6. PWA offline cache manifest.

---

## 8. Phase 8 retrospection

Delivered a complete, tested, documented static learning site rooted in the homework file, with piano support for men in mid-lower range and full session/progress tooling.
