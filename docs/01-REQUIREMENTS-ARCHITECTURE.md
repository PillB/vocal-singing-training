# Phase 1 — Requirements Definition & Architecture

## Preamble

Define the complete requirement set recovered from the user brief and homework file, then specify a high-level architecture for a production-ready, GitHub Pages–hosted learning site.

---

## 1. Recovered Requirements

### 1.1 Structure
- [R1] Two main tabs: **Vocal Training** (Vinh Giang) and **Singing Training** (Live Music School).
- [R2] Individual exercise mode *and* structured session mode (exercises in order).
- [R3] Pause and resume with progress persistence.
- [R4] User-enabled recording + audit/review (history of past takes).
- [R5] Exercise-specific metrics/scores with explanations.
- [R6] Tips & tricks from research, preserving original exercise spirit.
- [R7] 12-week plan logic: one element per week, record/review, continue or advance.
- [R8] Audio listening + generation where it helps learning.
- [R9] Complete usable self-paced home practice website.
- [R10] Generate and play **realistic piano chords** in a **mid-lower range for men**.
- [R11] Deploy to **GitHub Pages**; reference original homework MD.

### 1.2 Vocal exercises (from homework)
1. Better diction  
2. Maintain volume  
3. Lift soft palate  
4. Improve articulation (pen)  
5. Neutral ears (persona + story)  
6. How to connect  
7. Record & Review (3-step, 1-day delay guidance)  
8. Improve fluency (metaphors)  
9. 12-week plan  

### 1.3 Singing exercises (from homework)
1. Vocal fry → /A/ hold (log duration)  
2. /A/ on solfège over 4–5 chord progressions ×5  
3. Song stanzas (Feel, Better Man) solfège note changes ×5  

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│  index.html  ·  single-page app shell                   │
├─────────────────────────────────────────────────────────┤
│  css/styles.css     visual system, responsive layout    │
├─────────────────────────────────────────────────────────┤
│  js/exercises-data.js   enhanced library + metrics      │
│  js/storage.js          localStorage + IndexedDB        │
│  js/piano.js            Web Audio piano + progressions   │
│  js/recorder.js         MediaRecorder + playback        │
│  js/metrics.js          rubrics + duration helpers      │
│  js/session.js          structured session + pause      │
│  js/app.js              routing, UI, orchestration      │
└─────────────────────────────────────────────────────────┘
         │                         │
         ▼                         ▼
   localStorage              IndexedDB
   progress, plan,           recordings (blobs)
   session snapshot
```

### 2.1 State model

```js
// localStorage keys
VT_PROGRESS      // { exerciseId: { completedCount, lastScore, notes, history[] } }
VT_SESSION       // { mode, track, index, startedAt, pausedAt, status }
VT_WEEK_PLAN     // { week, element, status, reviews[], startedAt }
VT_SETTINGS      // { name?, maleRange: true, lastTab }
```

### 2.2 Views
1. Home / tab switcher  
2. Exercise list (per track)  
3. Exercise player (instructions, tips, audio, timer, record, metrics)  
4. Structured session runner  
5. Record & Review workflow  
6. History / audit  
7. 12-week plan dashboard  

### 2.3 Audio stack
- `AudioContext` master gain  
- Piano: multi-partial synthesis, soft hammer envelope  
- Chord player: voicings in C2–C4 for men  
- Recorder: `getUserMedia` → `MediaRecorder` → blob → IndexedDB  
- Optional `AnalyserNode` for rough level meter during record  

---

## 3. Non-functional

- Works offline after first load (static assets).  
- Mobile-responsive.  
- Encouraging, non-judgmental copy.  
- No backend required.  
- Accessible: keyboard focus, labels, sufficient contrast.  

---

## 4. Phase 1 Retrospection

### Done
- All requirements recovered and ID’d.  
- Architecture and storage design locked.  

### Gaps
| ID | Gap | Plan |
|----|-----|------|
| G1-1 | GitHub Pages base path | Use relative paths |
| G1-2 | Mic permission UX | Clear permission prompt + fallback message |

### Next
Phase 2 — enhance every exercise with tips, metrics, audio notes.
