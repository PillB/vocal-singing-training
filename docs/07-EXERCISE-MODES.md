# Exercise-specific practice modes

## Iterations

1. Schema (`practice-profiles.js`) + registry (`practice-modes.js`) + app mount  
2. Vocal detectors: volume, pause, rate/phases, concision gate  
3. Singing split: pitchHold / pitchChord / pitchSong / pitchMatch only where fit  
4. SOVT, siren range, breath S, onset, dynamic swell  
5. Hide irrelevant pitch-game chrome; auto metric patches  
6. Playwright + deploy  

## Dual review notes

- Architecture: single mic engine; modes only own HUD + frame logic  
- Product: no pitch-challenge on speaking drills; mode cue first  

## Mode list

See `js/practice-profiles.js` for per-id mapping.
