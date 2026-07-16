# Ad Monetization Decision Registry (living)

Product: **Vocal Studio / PillB** · Updated with orchestration Phases 0–7 (2026-07-16)

## Strategic decisions

| ID | Decision | Status | Rationale | Evidence |
|----|----------|--------|-----------|----------|
| AD-D01 | Subscriptions remain primary revenue | **Locked** | Education LTV ~$45; one Pro ≫ low-traffic display | Adapty 2026; internal ST-01 |
| AD-D02 | Practice path never hosts ads | **Locked** | User rage at mid-lesson ads; focus/mic conflict | Reddit/X 2025–26; Phase 2 |
| AD-D03 | Free tier may show **native** tips only first | **Locked** | Better UX + EPC than empty AdSense early | Phase 3 matrix |
| AD-D04 | Pro / trial = **ad-free** | **Locked** | Conversion stick (Duolingo Super pattern) | Duo case studies |
| AD-D05 | AdSense deferred until traffic + policy ready | **Locked** | Approval + RPM economics | AdSense RPM education $1–6 |
| AD-D06 | Master kill switch default **off** | **Locked** | Safe deploy; operator opt-in | Phase 5 |
| AD-D07 | No autoplay audio ads | **Locked** | Mic / piano conflict | Product constraint |
| AD-D08 | Pricing modal free of third-party ads | **Locked** | Trust at purchase moment | UX best practice |

## Gaps / work items

| ID | Gap | Severity | Status | Next |
|----|-----|----------|--------|------|
| AD-01 | No live native affiliates filled | P2 | Open (ops) | Paste real partner URLs in `ads-config.js` |
| AD-02 | `adsEnabled: false` | P2 | **By design** | Set true after review |
| AD-03 | No AdSense account / units | P3 | Deferred | After traffic + privacy policy |
| AD-04 | No A/B measurement of ad impact on retention | P2 | Open | Use VTAnalytics events |
| AD-05 | No public privacy policy page for AdSense | P2 | Open if AdSense | Static `privacy.html` |
| AD-06 | GH Pages commercial-primary risk if over-monetized | P2 | Monitor | Keep education primary |
| AD-07 | Pro CTA copy not yet “ad-free” framed | P3 | Partial | i18n when ads enabled |

## Change log

| Date | Note |
|------|------|
| 2026-07-16 | Registry created; strategy + scaffold shipped off-by-default |
