# Improved Prompting & Platform Strategy Document

**Phase 0 · Prompt Engineering & Domain Research**  
**Date:** 2026-07-15  
**Source homework:** `Vocal training and Singing training Homework.md`

---

## 0. Phase Preamble

**Goal:** Research best prompt-engineering practices (including GLM-5.2 agentic workflows) and high-quality interactive vocal/singing training platforms, then synthesize a strategy that guides every later phase so the final site is pedagogically sound, motivating, and technically solid.

---

## 1. Research Round 1 — Prompt Engineering & Agentic Systems

### 1.1 Core techniques (OpenAI, Anthropic, Stanford-style practice)

| Technique | Practice we adopt |
|-----------|-------------------|
| **Role + goal preamble** | Every phase starts with an explicit goal and success criteria |
| **Separation of concerns** | Specialized “agents” (research, pedagogy, UI, audio, implement, validate, fix) |
| **Evidence requirements** | Content claims tied to homework + external research references |
| **Self-refinement / critic loop** | Validate → root-cause → fix → re-validate |
| **Structured retrospection** | Gap registry after each phase |
| **Interleaved thinking** | Plan → act → check before moving on (GLM-5 family supports preserved/interleaved reasoning in agent loops) |
| **Explicit instruction density** | Long-horizon tasks need step lists, not vague goals |

### 1.2 GLM-5.2 / open-agent harness insights

- **Agentic loops beat one-shot prompts:** explicit phases, tools, and validation outperform single mega-prompts.
- **HTML/CSS generation is strong** for polished UIs; keep the stack simple (vanilla or light SPA) for reliability.
- **Compaction-aware long sessions:** save state (docs + localStorage schemas) so work can resume cleanly.
- **Critic / dual-pass:** Validator (learner) + Supervisor (checklist against success criteria).

### 1.3 How this shapes our build process

1. Recover *all* requirements from the user prompt + homework MD before coding.  
2. Enhance exercises with research *without* changing original intent.  
3. Implement → Playwright-style validation → fix until success criteria pass.  
4. Document decisions and gaps in a living registry.

---

## 2. Research Round 2 — Vocal & Singing Platforms

### 2.1 Platform patterns that work

| Pattern | Source inspiration | Our application |
|---------|-------------------|-----------------|
| Pitch / reference audio | Sing Sharp, ear-training apps | Piano chords + solfège cues in mid-lower range for male voices |
| Record & review | Vinh Giang Ex. 7; many coach apps | 3-step Auditory → Visual → Transcription review with delay guidance |
| Non-judgmental metrics | Pedagogy best practice | Rubrics + optional self-scores; growth language, not “fail” |
| Structured paths + free practice | LMS / skill apps | Individual exercise OR ordered structured session |
| Pause / resume | Session apps | `localStorage` session state + progress |
| Progress loops | 12-week plan in homework | Weekly element focus, record/review gate, improve-or-continue logic |

### 2.2 Expert / method anchors

- **Vinh Giang (speaking):** diction exaggeration, volume consistency, soft palate, pen-in-mouth articulation, persona/story work, connection, record-review, fluency (metaphors), deliberate 12-week micro-focus.
- **Live Music School (singing):** vocal fry → closure → sustained /A/; chord-progression solfège; song stanzas with note changes; air dosing; “sing like you speak.”
- **Male / baritone range:** mid-lower piano (roughly C2–C4 roots) for comfortable speaking-to-singing transition; avoid high reference tones that force strain.

### 2.3 Audio AI / browser tech

- **MediaRecorder** for capture; **IndexedDB** for recordings (localStorage too small).  
- **Web Audio API** for piano-like additive synthesis + playback analysis.  
- Prefer **client-side only** for privacy and GitHub Pages deployability.  
- Reference tones: **block chords + arpeggios** for progressions; metronome-optional later.

---

## 3. Synthesized Strategy

### 3.1 Exercise flow design

1. **Prepare** — goal, duration, setup (book, pen, mic).  
2. **Guide** — step-by-step instructions (original spirit + clarity).  
3. **Support** — tips, common mistakes, optional audio reference.  
4. **Practice** — timer / logs / recording as needed.  
5. **Reflect** — metrics rubric or self-score + notes.  
6. **Save** — history + 12-week progress if applicable.

### 3.2 When to use audio

| Use case | Listen (reference) | Generate (piano) | Record |
|----------|--------------------|------------------|--------|
| Diction / volume / soft palate / pen | Optional demo cues | — | Optional |
| Neutral ears / connect / fluency | — | — | Recommended |
| Record & Review | Playback of self | — | Required |
| Vocal fry /A/ hold | Example timing tones | Pitch A reference (men’s) | Optional log |
| Chord solfège | Chord loop | Full progressions (5 sets) | Optional |
| Song stanzas | Progression under melody | Song-friendly keys (Feel / Better Man friendly) | Recommended |

### 3.3 Metrics philosophy (non-judgmental)

- Prefer **process metrics** (duration held, consistency self-rate, clarity 1–5) over absolute “talent” scores.  
- Always show **how the score is derived**.  
- Frame low scores as **next practice focus**, not failure.

### 3.4 Piano range for men

- Default root area: **C3–A3** (baritone-friendly mid-lower).  
- Progressions voiced with roots ~ **C2–C3**, triad notes within ~ **C3–E4**.  
- Soft attack, longer decay → realistic practice-piano feel via multi-partial synthesis.

---

## 4. Phase 0 Retrospection

### Done
- Prompting / multi-agent strategy captured.  
- Platform patterns mapped to features.  
- Audio/metrics/session strategy defined.  
- Homework source identified and will be the content spine.

### Gaps / risks (registry seed)
| ID | Gap | Severity | Plan |
|----|-----|----------|------|
| G0-1 | No real Vinh Giang / LMS licensed media | Med | Text + generative piano only; cite homework |
| G0-2 | True AI pitch analysis out of scope for static Pages | Med | Self-rubrics + optional volume/duration analysis |
| G0-3 | Realistic piano without sample banks | Low | High-quality additive piano synth |

### Next
Phase 1 — full requirements recovery + architecture.

---

## References (research anchors)

- GLM-5 / 5.2 agent harness discussions (MindStudio, Z.ai / arXiv GLM-5 agentic engineering).  
- Anthropic-style interleaved thinking & explicit multi-step agent prompts.  
- Sing Sharp and similar pitch-feedback apps (interaction patterns, not clones).  
- Web Audio API piano/synth patterns (MDN synth keyboard; sample+pitch-shift piano articles).  
- Male baritone warm-up / arpeggio practice conventions (mid-range, gentle passaggio work).  
- Original homework: `Vocal training and Singing training Homework.md`.
