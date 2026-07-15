# Integration review & 6 iteration log

## Research synthesis (AI-built app pitfalls)

| Pitfall | Source signal | Our fix |
|---------|---------------|---------|
| Feature museum / too many peer Starts | User report; Elon review; X posts on AI UX | **One Start practice** |
| Same generic multi-card layout | “every app looks the same” | Practice cockpit primary visual |
| Reading before doing | Product reject criteria | Guide collapsed by default |
| Tools don’t talk to each other | Architecture review | Shared `PracticeEngine` stream |
| Settings tax before value | Elon: path/tier noise | Continue CTA + path demoted |
| Demo not product | Medium / AI app critiques | Auto piano + auto hold + auto pitch |

## Subagent consensus

**Zuckerberg (architecture):** Extract practice lifecycle, single mic graph, VAD holds, session teardown, wall-clock timer.  
**Elon (product):** Mission = better sound in 10s; one CTA; sticky feedback; kill scroll-to-practice.

## Six iterations

### Iteration 1 — Unified practice engine
- Added `js/practice-engine.js`: one mic, RMS, pitch, auto-hold ≥2s, optional record.

### Iteration 2 — Pitch visualizer slave mode
- `startExternal()` + `pushFrame()` so pitch graph shares practice stream (no double permission).

### Iteration 3 — Practice cockpit UI
- Replaced fragmented tool cards with single cockpit: Start/Stop, status, timer, level, pitch, holds, piano.

### Iteration 4 — Auto-arm matrix
- Start practice → mic + pitch (if any) + timer + optional record + auto piano/ref loop.

### Iteration 5 — Product polish
- Continue practice on home; guide collapsed; wall-clock timer; session pause tears down practice.

### Iteration 6 — Validation & deploy
- Playwright asserts single primary CTA, integrated singing UI, continue flow, tiers.

## Success criteria met
- [x] One primary Start practice  
- [x] Auto pitch + auto hold detection  
- [x] Shared listening path  
- [x] Piano auto on start (toggleable)  
- [x] Pause/end stops practice fully  
- [x] Doing above reading  
