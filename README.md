# Vocal & Singing Training

Self-paced practice website for **Vocal Training** (speaking foundations) and **Singing Training** (technique drills), built from the project homework file.

**Homework source:** [`Vocal training and Singing training Homework.md`](./Vocal%20training%20and%20Singing%20training%20Homework.md)

## Features

- **Two main tabs:** Vocal Training · Singing Training 
- **Basic + Advanced tiers** — homework spine kept as basic; 11+ research-backed advanced exercises per track 
- **Individual exercises** or **structured sessions** (basic / advanced / full paths) 
- **Pause / resume** session state (localStorage) 
- **Recording + playback** with local history (IndexedDB) 
- **Record & Review** 3-step workflow (Auditory → Visual → Transcription) 
- **Exercise metrics** with transparent 0–10 practice scores 
- **12-week plan** dashboard (one focus element, check-ins, improve-or-continue) 
- **Piano chords** — mid-lower male range (C2–E4) with **Arpeggio** and **Sustain note** (3–5s hold) 
- **Pitch visualizer** — target trail, live voice dot, moving-average deviation band (accuracy + precision) 
- **Subscriptions (Pro)** — Stripe (global) + Mercado Pago (Perú/LATAM); opt-in 7-day trial; entitlements signed by [`workers/entitlements/`](workers/entitlements/); see [docs/10-SUBSCRIPTIONS.md](docs/10-SUBSCRIPTIONS.md)
- **Internal auth** — 2 admin + 10 F&F tester accounts (hashes in repo; plaintext sheet gitignored); see [docs/11-AUTH-AND-HARDENING.md](docs/11-AUTH-AND-HARDENING.md)

## Using it

The written manual is [`guide.html`](guide.html), published alongside the site
at <https://pillb.github.io/vocal-singing-training/guide.html>. It is in Spanish
and English and covers the parts of the interface that cannot be guessed: what
the colours on the pitch highway mean, what each number is, which exercises need
the microphone, and what a denied microphone looks like. It is also linked from
the footer of every page and from each step of the in-app tour.

## Run locally

Open `index.html` in a modern browser, or run a local server:

```bash
npm ci
npm run serve
```

Microphone access requires a secure context (`localhost` or HTTPS).

## Quality and release checks

```bash
npm run lint        # cyclomatic complexity <= 15 for new/changed functions
npm run test:core   # lint, catalog, DSP/recorder and Worker contracts
npm test            # above + full Playwright browser suite
```

The [production audit and open-issue ledger](docs/40-PRODUCTION-AUDIT-2026-11-01.md)
records reproducible defects, research sources, mitigations, trade-offs and
release gates. In particular, green unit tests do not certify acoustic
accuracy on real voices or that the deployed GitHub Pages version was updated.
The contributor engineering contract is [AGENTS.md](AGENTS.md); pull requests
are checked by `.github/workflows/quality.yml`.

## Live site

**https://pillb.github.io/vocal-singing-training/**

## GitHub Pages

This repo is configured for GitHub Pages from the `main` branch root (`/`). 
Repository: https://github.com/PillB/vocal-singing-training

## Tech

Vanilla HTML / CSS / JS — no build step. Web Audio API (piano), MediaRecorder (voice), localStorage + IndexedDB (progress & recordings).

## Docs

- [Strategy (Phase 0)](docs/00-STRATEGY.md) 
- [Requirements & architecture](docs/01-REQUIREMENTS-ARCHITECTURE.md) 
- [Exercise library](docs/02-EXERCISE-LIBRARY.md) 
- [UI/UX](docs/03-UI-UX.md) 
- [Final report](docs/FINAL_REPORT.md) 
- [Gap registry](docs/GAP-REGISTRY.md) 
- [Subscriptions (Peru + worldwide)](docs/10-SUBSCRIPTIONS.md)
- [Auth & hardening](docs/11-AUTH-AND-HARDENING.md) 
- [The tour, the user guide and the A/B machinery](docs/36-TOUR-AND-USER-GUIDE.md)
- [The daily loop: basics every day, rest days and surprises](docs/37-DAILY-LOOP.md)
- [2026 production audit, issue ledger and release gates](docs/40-PRODUCTION-AUDIT-2026-11-01.md)
- [Evidence-based technical vocal protocol: breath, steady pitch, and song transfer (2026-11-06)](docs/44-PROTOCOLO-TECNICO-VOCAL-EVIDENCIA-2026-11-06.md)
- [Bilingual eight-drill vocal pilot: evidence mapping, test oracle and root-cause ledger](docs/45-EVIDENCE-TO-EXERCISE-VALIDATION.md)
- [Goal sets and guided voice drills: what was built, the evidence, the trade-offs and what is not yet verified](docs/47-SESSION-SETS.md)

## Privacy

Audio recordings are kept on this device. Practice history is stored in the
browser by default; if you sign in and enable account features, some progress
can sync with the account service. The app also sends anonymous usage
statistics unless you opt out via the privacy control. See
[privacy.html](privacy.html) for the scope, controls and retention information.
