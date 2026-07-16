# Dual-agent review scorecard (Elon + Zuckerberg)

## Process
1. Explore/plan subagents scored all 34 exercises 
2. Critical fixes implemented 
3. Playwright re-run 
4. Success only if FAIL items cleared 

## Architecture must-fixes (Zuckerberg) — done
- [x] pitchGame snapshot before mode `onStop` 
- [x] Remount mode on every Start practice 
- [x] Clear holds on engine start 
- [x] `dtMs` on frames; silence gates use real ms 
- [x] No `metronomeSpeech = rateLadder` alias 
- [x] Distinct modes for v11, v20, s7, s14 
- [x] scaleSteps pitch-gated 
- [x] Honest metrics (no invented pitchStable=3, targets=hold/2) 

## Product must-fixes (Elon) — done
- [x] v8 metaphor HUD (not rate ladder) 
- [x] v11 fillerDetect (not pauseDetect clone) 
- [x] v20 energyMatch triad 
- [x] v3 count logger 
- [x] s10 no fake lock button 
- [x] s14 staccatoLegato 
- [x] s4/s6 SOVT with straw variant + transfer mark 
- [x] s7 humTargets 

## Post-fix expected status
All prior **FAIL** items addressed.

## WEAK hardening pass (continue-plan)
- [x] v1 rate ladder — visual BPM pulse per phase 
- [x] v4 pen — clarity A/B sliders after phases 
- [x] v5 persona — rotating persona prompts 
- [x] v6 connect — YOU/THEM scripted slots; no auto presence score 
- [x] v13 volume ladder — band credit ≥50% of step 
- [x] v14 key points — slow-window confirmation 
- [x] v15 gestures — muted-review checkbox 
- [x] s3 song — in-lane % + optional accuracy patch 

## Success definition met
- Mode fitness per exercise (no FAIL clones) 
- Pitch challenge only s9 
- Honest auto-metrics 
- Dual-agent review + Playwright green before declare success 

