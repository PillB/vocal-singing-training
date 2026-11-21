# Shared Issue / Gap Registry

| ID | Phase | Gap | Severity | Status | Fix |
|----|-------|-----|----------|--------|-----|
| G0-1 | 0 | No licensed coach media | Med | Accepted | Text + generative piano |
| G0-2 | 0 | No ML pitch tracking | Med | Accepted | Self-rubrics + refs |
| G0-3 | 0 | Piano without sample bank | Low | Mitigated | Additive multi-partial piano |
| G1-1 | 1 | GH Pages base path | Low | Fixed | Relative asset paths |
| G1-2 | 1 | Mic permission UX | Med | Fixed | Clear copy + toast on denial |
| G2-1 | 2 | Song lyrics copyright | Med | Fixed | User-owned stanzas prompt only |
| G2-2 | 2 | No auto pitch score | Low | Accepted | Self note accuracy |
| G4-1 | 4 | IndexedDB unavailable (private mode rare) | Low | Mitigated | Try/catch + toast |
| G6-x | 6 | Validation findings | — | See FINAL_REPORT | Iterative |
| P48-1 | 2026-11-21 | Historial › Logros: the ☆ grid listed locked badges with thresholds, two went dark again (3 días seguidos, Meta semanal), two rewarded held-note length, one a Pro export. Expected: earned-only, never taken back, practice-only. Root cause: badges computed from live stats each draw | Med | Fixed | Tu camino (docs/48): logros from the day ledger, stored once earned |
| P48-2 | 2026-11-21 | Historial › Tu camino: "Nuevo" vanished as Historial drew the card a second time on the way in (seen marked by the first, hidden draw). Shared path: any card drawn before its view shows | Low | Fixed | Seen counts when on screen; the label stays until the card leaves it (browser test, mutant VU2) |
| P48-3 | 2026-11-21 | Inicio › Tu camino button said "2 nuevos" after the completion card had shown both | Low | Fixed | The card's lines refresh the button (mutant VU3) |
| P48-4 | 2026-11-21 | Tu camino · screen reader read "1 días" / "0 días, aún no"; group labels at 11.8 px | Low | Fixed | One spoken sentence per area; labels 12.5 px (browser test, mutant VU9) |
| P48-5 | 2026-11-21 | Tu camino · two captions claimed more than their source ("el oído es mejor juez", "tanto como cantar") | Low | Fixed | Rewritten to what the sources say |
| P48-6 | 2026-11-21 | Tu camino · a stage waiting to be shown is stored as false, which sync drops | Low | Accepted | The stage itself syncs; only its announcement can be lost (docs/48 D4) |
| P48-7 | 2026-11-21 | Inicio › routine line: "1:15" read as a time of day, "trill solfège" not understood (think-aloud, 9 personas) | Low | Fixed | "1 min 15 s", "do-re-mi on a trill" |
| P48-8 | 2026-11-21 | Inicio › strip: the Tu camino button made the strip under this week's ticks 288 px tall on a phone (budget 260, home-design.spec.js) | Low | Fixed | The strip's three buttons share one wrapping row (`.loop-actions`) |
| P48-9 | 2026-11-21 | Inicio › Tu camino at 200 % zoom (640 × 360): the jump to the card landed with its title at the bottom of the screen. Root cause: a second scroll fired before Historial's calendar was drawn, which then pushed the card down | Low | Fixed | Only the draw after the calendar scrolls (browser test "200% zoom", mutant VU15) |

Update after each validation round.
