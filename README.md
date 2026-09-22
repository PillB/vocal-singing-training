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

Open `index.html` in a modern browser, or:

```bash
npx serve.
# or: python3 -m http.server 8080
```

Microphone access requires a secure context (`localhost` or HTTPS).

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

## Privacy

All practice data and recordings stay in your browser on this device.
