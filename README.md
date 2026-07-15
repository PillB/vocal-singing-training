# Vocal & Singing Training

Self-paced practice website for **Vocal Training** (Vinh Giang–inspired speaking foundations) and **Singing Training** (Live Music School–inspired technique), built from the project homework file.

**Homework source:** [`Vocal training and Singing training Homework.md`](./Vocal%20training%20and%20Singing%20training%20Homework.md)

## Features

- **Two main tabs:** Vocal Training · Singing Training  
- **Individual exercises** or **structured sessions** (in order)  
- **Pause / resume** session state (localStorage)  
- **Recording + playback** with local history (IndexedDB)  
- **Record & Review** 3-step workflow (Auditory → Visual → Transcription)  
- **Exercise metrics** with transparent 0–10 practice scores  
- **12-week plan** dashboard (one focus element, check-ins, improve-or-continue)  
- **Piano chord generation** — realistic multi-partial piano in a **mid-lower male range** (C2–E4) for solfège and song progressions  

## Run locally

Open `index.html` in a modern browser, or:

```bash
npx serve .
# or: python3 -m http.server 8080
```

Microphone access requires a secure context (`localhost` or HTTPS).

## GitHub Pages

This repo is configured for GitHub Pages from the `main` branch root (`/`).

## Tech

Vanilla HTML / CSS / JS — no build step. Web Audio API (piano), MediaRecorder (voice), localStorage + IndexedDB (progress & recordings).

## Docs

- [Strategy (Phase 0)](docs/00-STRATEGY.md)  
- [Requirements & architecture](docs/01-REQUIREMENTS-ARCHITECTURE.md)  
- [Exercise library](docs/02-EXERCISE-LIBRARY.md)  
- [UI/UX](docs/03-UI-UX.md)  
- [Final report](docs/FINAL_REPORT.md)  
- [Gap registry](docs/GAP-REGISTRY.md)  

## Privacy

All practice data and recordings stay in your browser on this device.
