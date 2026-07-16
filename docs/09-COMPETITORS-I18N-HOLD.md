# Competitors, localization, hold grace

## Competitors / similar apps (learn & differentiate)

| Source | Does well | Does poorly | We double down |
|--------|-----------|-------------|----------------|
| popular pitch apps | Game streaks, real-time pitch color | Unclear *why* off-pitch; fixed drills | Cents + lane + precision band |
| pitch training apps | Pitch diagnostics, customizable drills | Timing UI confusion | One Start practice, clear cues |
| karaoke-style apps | Fun karaoke XP | Little technique teaching | Technique modes (SOVT, breath, pause) |
| AI-built apps (common) | Feature volume | Feature museum, EN-only, judgmental scores | Single CTA, dual lang, honest metrics |

## AI-agent pitfalls avoided
- Too many peer Starts → one **Start practice**
- Same pitch game on all drills → per-exercise modes
- Fake talent scores → process metrics + self-rate
- English-only shell → **ES default + EN toggle**

## Localization (best practices applied)
- Default **es** (LatAm/Perú, clear international Spanish, no slang)
- Toggle shows language **in its own name** (English / Español) — no flags
- `localStorage` persistence; `html[lang]`
- Parity of chrome strings via `data-i18n`

## Hold detector grace
- `HOLD_GRACE_MS` ≈ 550ms: brief RMS/pitch dropouts continue the same hold
- `SILENCE_END_MS` ≈ 900ms before logging end
- Once holding, energy-only can continue (pitch can flake mid-sustain)
- Hold clock keeps running through grace (retroactive continuity)
