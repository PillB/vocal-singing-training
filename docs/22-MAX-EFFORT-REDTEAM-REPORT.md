# Max-effort dual-agent review & red team report

**Date:** 2026-07-16 (session)  
**Product:** Vocal Studio (GH Pages SPA)  
**Method:** Dual personas (first-principles UX + adversarial scale/security), Playwright interactive journeys, client-side stress, static secret scan.  
**Research anchors:** Playwright user-facing tests, frontend chaos (offline/latency), SPA security (soft entitlement, XSS sinks, allowlists).

---

## Agents

| Agent | Mandate | Suites |
|-------|---------|--------|
| **Musk-mode** | Ruthless UX: every major surface, Start/Stop, SH silence/Space, geometry, chaos offline | `tests/max-effort-journeys.spec.js` |
| **Zuck-mode** | Forge Pro, billing return abuse, storage flood, races, XSS probe, secrets, admin exposure | `tests/redteam-client.spec.js` + `qa/redteam-static.mjs` |

**Re-run:**

```bash
npm run serve   # terminal 1
npm run test:redteam
```

---

## Surfaces exercised

| Surface | Result |
|---------|--------|
| Home tabs / tiers / cards / value pulse | Pass |
| Pricing modal open/close | Pass |
| Vocal Start → Stop | Pass (metrics may be collapsed — not a crash) |
| SH ladder silence → Space assist (focus on Stop) | Pass |
| Pitch highway Start + viewport bottom | Pass |
| Lang toggle mid-exercise | Pass |
| History + 12-week plan | Pass |
| Offline mid-nav | Pass (no white-screen) |
| Open/close 12 exercises | Pass (no pageerror) |
| Soft Pro forge via localStorage | **Accepted risk** — soft client gate |
| Billing return without session_id | Pass (no crash) |
| Evil portal URL | Rejected by allowlist |
| Double-click / rapid Start-Stop | Pass |
| Corrupt / flooded progress storage | Pass |
| XSS via form fields | Pass (no execution) |
| Secret keys in `js/` | Pass (none) |
| Admin tools when logged out | Hidden |
| Lang flip ×15 | Pass |

Prior locks also green in redteam script: Space assist, hit-targets, SH air, billing, auth.

---

## Findings

| ID | Sev | Agent | Finding | Status |
|----|-----|-------|---------|--------|
| F1 | **P1 accepted** | Zuck | **Soft Pro entitlement is forgeable** via `localStorage` (`vt_billing_v1`). Expected on static GH Pages without webhook verification. | **Accept** — document; harden with Worker webhook when revenue matters (`workers/stripe-webhook`) |
| F2 | P2 | Zuck | `innerHTML` concatenations in `app.js` (guide steps, some UI). Currently fed from locale packs, not raw user HTML. | Monitor; prefer `textContent` / escape if user notes ever render HTML |
| F3 | P2 | Musk | Metrics form often **collapsed** after Stop — easy to miss for learners. | Product polish (not blocking practice) |
| F4 | P0 fixed earlier | Both | Space activated focused Start/Stop; SH silence free-run | Fixed in `63bd484` + locked by tests |
| F5 | Info | Zuck | No private “backend” on Pages — stress target is browser storage + mic + soft billing only | Design constraint |

---

## Static scan (`qa/redteam-static.mjs`)

- **P0 secrets in shipped app JS:** none  
- **P2 innerHTML-concat in app:** few sites (guide list rendering) — trusted catalog strings  

---

## Gaps / next max-effort backlog

1. Real-device SH mic pass (cannot fully automate OS noise suppression).  
2. Deploy Worker webhook → hard entitlement (closes F1).  
3. Optional gremlins.js random click fuzz on home (chaos).  
4. Full catalog Start smoke already in `full-journey.spec.js` — keep in CI.  
5. Multi-tab storage races (two tabs forging progress).  

---

## Verdict

**Ship posture:** Client UX contracts for Start / Space / silence SH are **test-locked**. Soft billing remains intentionally weak until webhooks. No live secrets in client bundles. Dual-agent suite is re-runnable via `npm run test:redteam`.
