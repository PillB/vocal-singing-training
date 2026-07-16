# Ad Monetization Orchestration  
## Phases 0–7 · Unobtrusive passive income · Vocal Studio (PillB)

**Product (actual):** Static SPA — vocal & singing practice (GitHub Pages), freemium Pro coach tools  
**Not in scope of this codebase:** Python course / CodePlayground (prompt template; findings adapted to **this** product)  
**Date:** 2026-07-16  
**Related:** [`10-SUBSCRIPTIONS.md`](./10-SUBSCRIPTIONS.md) · [`14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md`](./14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md) · [`AD-MONETIZATION-REGISTRY.md`](./AD-MONETIZATION-REGISTRY.md) · `js/ads.js` · `js/ads-config.js`

---

# Phase 0 — Setup preamble & 2026 Educational Platform Ad Monetization Reference

### Pre-round research (2025–2026)
- Education app revenue ~$6.4B (2025); Duolingo ~$1B IAP leader — [Business of Apps](https://www.businessofapps.com/data/education-app-market/)
- Education subscription LTV ~$45/12mo (Adapty 2026) — [Adapty Education benchmarks](https://adapty.io/blog/education-app-subscription-benchmarks/)
- RevenueCat State of Subscription Apps 2026 (Education pricing power, annual bias) — [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-education/)
- Display CPM education ~$2.95–$7.65 band in one 2026 benchmark set — [Digital Applied display 2026](https://www.digitalapplied.com/blog/display-advertising-benchmarks-2026-data-points)
- AdSense-style education/e-learning publisher RPM often **$1–$6** (finance/SaaS much higher) — [Inno Panda AdSense 2026](https://innopanda.com/google-adsense-in-2026/)
- Publisher formats 2025: sticky, interstitial, side rail, **rewarded** — prioritize non-intrusive layout — [OptiDigital](https://optidigital.com/resources/blog/top-ad-formats-for-publishers-in-2025/)
- Duolingo: free = ads + limits; Super = ad-free; **ads &lt;~10% revenue**, strategic “stick” for conversion — [case synthesis 2026](https://muhammadjubairhasan.medium.com/business-case-study-duolingo-gamifying-education-and-building-a-habit-forming-empire-ba1d81411848)
- User backlash when free becomes “ads every few minutes / energy + ads” — Reddit r/duolingo, r/languagelearning; X posts 2025–2026
- GitHub Pages: ads allowed if site not *primarily* commercial spam; project sites OK for secondary monetization — [GitHub community](https://github.com/orgs/community/discussions/186793)

### Preamble
Establish an evidence-based baseline for **passive ad income that does not damage learning focus or Pro conversion** on a **practice-first voice app**.

### Reference document (operative rules)

| Principle | Evidence-backed rule |
|-----------|----------------------|
| **Subscriptions first** | Education LTV is subscription-heavy; ads are secondary monetization of free MAU |
| **Never paywall practice** | Free-rich freemium already differentiates vs Yousician-style caps; ads must not recreate time-caps mid-exercise |
| **Ads after value** | Place only at natural breaks (home, post-session), never during mic/piano/highway |
| **Pro = ad-free + tools** | Duolingo pattern: Super removes ads; we already sell coach tools — ad-free is additive stick |
| **Native &gt; interrupt** | Low-traffic SPA: affiliate/native cards often beat empty AdSense slots on RPM *and* UX |
| **Density discipline** | Avoid Duolingo-level frequency until high MAU; users quit over “ad every lesson” |
| **Privacy** | Prefer first-party native cards; third-party scripts only after consent strategy if GDPR-relevant markets grow |
| **Honest free tier** | “Free forever practice + light studio tips” beats “free but unusable” |

### Phase 0 retrospection
For Vocal Studio, **subscription go-live (ST-01/02) remains higher EV than early AdSense**. Ads should be a **light free-tier layer** designed for long-term trust, not max short-term CPM.

---

# Phase 1 — Current Platform & Monetization Audit

### Pre-round research
Patterns for freemium audit: free core → paid power tools; map “aha” before monetization friction (Hormozi / freemium SaaS). See also [`14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md`](./14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md).

### Preamble
Map **Vocal Studio** (not a Python course): free journey, Pro gates, natural ad surfaces.

### Inventory

| Surface | Free today | Pro today | Ad-safe? |
|---------|------------|-----------|----------|
| Exercise catalog + Empezar | ✅ unlimited | — | **No ads during** |
| Pitch highway, piano, range auto | ✅ | — | **No ads during** |
| Local record / metrics | ✅ | — | **No ads during** |
| Value pulse / streaks | ✅ | Insights depth | **Yes — below pulse** |
| Home / history / plan views | ✅ | — | **Yes — footer / side** |
| Post-session toast/summary | ✅ | — | **Yes — after complete** |
| Export coach pack | ❌ | ✅ | n/a |
| Multi-profile, goals, freezes | soft/Pro | ✅ | n/a |
| Pricing modal | — | CTA | **No third-party ads** (trust) |
| Checkout (Stripe/MP) | — | Payment Links | n/a |

### Free user journey (value delivery)

```
Land → Tour optional → Home (value pulse)
  → Pick exercise → Empezar → mic + piano + highway  [SACRED: no ads]
  → Finish → toast / history log  [OK: post-session native card]
  → Return days (reminders, freezes) → optional Pro CTA after proof
```

### Monetization today
- Soft local entitlement + trial  
- Pro: export, multi-profile, insights, goals, progressions, reminders/freezes  
- **No ad system** (pre this orchestration)  
- Ops: empty Payment Links, `demoUnlockEnabled: true`

### Phase 1 retrospection
The product’s competitive moat is **unlimited free practice**. Any ad design that interrupts Empezar destroys Hormozi “likelihood × low effort” and contradicts prior value research.

---

# Phase 2 — User Perspective Research

### Pre-round research
Sources: Reddit (r/duolingo, r/languagelearning, r/learndutch), X (2025–2026), Product discourse on freemium education.

### Preamble
Capture authentic tolerance thresholds for ads in learning apps.

### Themes (with sources)

| Theme | User voice / pattern | Implication for us |
|-------|----------------------|--------------------|
| **Ads after lesson tolerable if rare** | Busuu “ads at end of lesson less annoying than Duo” — [r/learndutch](https://www.reddit.com/r/learndutch/comments/1iet1cz/) | Prefer **post-session**, not mid-drill |
| **Frequency caps broken = rage-quit** | Duo: energy + “3 ads per lesson” called unusable — [X Jul 2026](https://x.com/hyukatwt/status/2075356352420237383) | Hard cap frequency |
| **Paying for quiet is real value** | “Try free then ads feel jarring — best investment” — [X May 2025](https://x.com/lidolmix/status/1925493719123599853) | **Ad-free Pro** is a convert lever |
| **Free that still teaches is loved** | Khan Academy / truly free apps celebrated vs ad-trap apps — [NerdSip free apps 2026](https://nerdsip.com/blog/best-free-learning-apps-2026) | Keep practice free & functional |
| **Edtech 1.0 = engagement over learning** | Udemy co-founder critique — [X Oct 2025](https://x.com/gaganbiyani/status/1981736889234452619) | Don’t monetize in a way that reduces practice quality |
| **Spammy free apps push $5 remove-ads** | “Can’t see content for ads” — X Jul 2026 | Never cover UI critical path |

### Sentiment summary
- **Acceptable:** occasional post-task ads; clear Pro remove-ads benefit; relevant native tips  
- **Unacceptable:** mid-practice interrupt, audio-competing video over mic, wall-to-wall banners, fake scarcity  

### Phase 2 retrospection
Users will tolerate **honest free + light ads** if learning remains excellent; they punish **engagement traps**.

---

# Phase 3 — Economic & Format Analysis

### Pre-round research
CPM/RPM benchmarks 2025–2026 (display, education niche, YouTube education for upper bounds).

### Preamble
Rank formats by **revenue × (1 − UX harm)** for a low/medium-traffic practice SPA.

### Comparative matrix

| Format | Revenue potential (low traffic) | UX disruption | Fit for voice practice | Tech ease | Verdict |
|--------|----------------------------------|---------------|------------------------|-----------|---------|
| **Native / affiliate studio cards** | Medium–high EPC if gear/courses convert | Low | High (mics, stands, books) | High | **Primary** |
| Display banner (home/history) | Low RPM (~$1–6 education) | Low–med | OK if not sticky over stage | Med (AdSense) | **Secondary at scale** |
| Sticky bottom bar | Med viewability | Med–high on mobile practice | **Poor** during exercise | Med | **Avoid on stage** |
| Full interstitial mid-flow | Higher eCPM | **Very high** | Destroys focus | Med | **Forbidden during practice** |
| Post-session interstitial | Higher eCPM | Med | OK if ≤1 / session | Med | Optional later |
| Rewarded video (opt-in) | High eCPM | Low if opt-in | OK for *temporary* Pro perk | Higher (AdMob/web video) | **Later scale** |
| Sponsored lesson pack | High if B2B | Low if labeled | Good | Manual | Opportunistic |
| Self-promo Pro only | Indirect | None | Excellent | Done | Keep |

### Economics (honest for this product)

| Scenario | Assumption | Order-of-magnitude |
|----------|------------|--------------------|
| Early SPA traffic | 1–5k page views / mo | AdSense may be **&lt;$5–30/mo** |
| Affiliate | 50 clicks × 2% × $20 commission | **~$20** rare months can beat ads |
| Single Pro conversion | $9.99/mo or $79/yr | **One yearly Pro ≫ months of display ads** |

**Conclusion:** Until traffic is large, **optimize for Pro conversion and trust**; use **native/affiliate** for passive income; wire AdSense only when traffic + content policy readiness justify maintenance.

### Phase 3 retrospection
Most profitable *per user* is still **subscription**. Most profitable *per free user at scale* is layered ads; most profitable *least harmful early* is **native + ad-free Pro**.

---

# Phase 4 — Strategy: Value-Aligned Ad Integration

### Pre-round research
Hybrid free+ads+sub models (Duolingo, language apps); freemium monetization layers (Adapty, AgileEngine 2026 free-app monetization).

### Preamble
Design ads that **fund free practice** without undermining “practice free forever” or Pro coach value.

### Strategy (Vocal Studio)

#### Tier model (updated differentiation)

| Tier | Experience |
|------|------------|
| **Free** | Unlimited practice · light **native studio tips** (optional display later) · soft Pro CTAs after proof |
| **Trial / Pro** | **Zero ads** · export · multi-profile · insights · goals · freezes · portal |

#### Placement policy (hard rules)

| Zone | Allowed |
|------|---------|
| During Empezar / mic / piano / highway | **Never** |
| Pricing / checkout | No third-party ads |
| Home below value pulse | Native card (1) |
| History / plan foot | Native or display (1) |
| After session complete | Native card or optional rewarded (opt-in) |
| Header sticky | **No** |

#### Frequency caps
- Max **1** native impression surface refresh per home visit  
- Max **1** post-session card per completed exercise  
- No autoplay audio ads (mic conflict)  
- No video over practice stage  

#### Value framing (copy)
- Free: “Practice free · light studio tips keep the lights on”  
- Pro CTA: “Pro removes tips/ads + coach export & multi-profile”  
- Never: guilt or “you must watch to continue” for core practice  

#### Contextual relevance
Native catalog examples (operator-editable in `ads-config.js`):
- USB condenser mics, pop filters, headphones  
- Spanish/English singing method books  
- In-person coach directories (non-competing)  
- Optional “our Pro” only as secondary CTA, not disguised ad  

### Phase 4 retrospection
Strategy protects learning; monetizes free MAU; strengthens Pro with **ad-free** as tangible benefit.

---

# Phase 5 — Technical Implementation Plan

### Pre-round research
AdSense on GH Pages feasible if not pure commercial spam; SPA + custom domain helps approval; third-party scripts hurt LCP — load lazy.

### Preamble
Ship a **maintainable, off-by-default** ad layer with Pro ad-free gate.

### Architecture

```
VT_ADS_CONFIG (js/ads-config.js)
    adsEnabled: false          // master kill switch
    mode: "native" | "adsense" | "hybrid"
    nativeCards: [...]         // first-party / affiliate
    adsense: { client, slots } // empty until approved
    frequency: { homeMs, postSessionMs }

VTAds (js/ads.js)
    shouldShowAds()  // !Pro && adsEnabled && free path
    renderSlot(id)   // #ad-slot-home, #ad-slot-post-session
    track(event)     // VTAnalytics if present
```

### Implementation status in repo
- `js/ads-config.js` + `js/ads.js` scaffold  
- HTML slots (hidden when disabled or Pro)  
- Wired from `app.js` home + post-session hooks  
- **Default: ads off** until operator enables  

### Step-by-step go-live (operator)

**Phase A — Native only (recommended first)**  
1. Set `adsEnabled: true`, `mode: "native"`.  
2. Fill `nativeCards` with real affiliate URLs (Amazon Associates, etc.) + `rel="sponsored noopener"`.  
3. Verify free user sees card; activate Pro → card gone.  
4. Measure clicks via `VTAnalytics` / UTM.

**Phase B — AdSense (when traffic ready)**  
1. Custom domain preferred for AdSense review.  
2. Privacy policy page + contact.  
3. Create display units; paste `data-ad-client` / slot ids.  
4. Set `mode: "hybrid"`; load script only if `shouldShowAds()`.  
5. Never inject during `#view-practice` / live session.

**Phase C — Rewarded (optional, high MAU)**  
1. Opt-in only: “Watch to unlock export for 24h”.  
2. Must not block Empezar.  
3. Prefer web rewarded networks carefully (policy + UX review).

### Automation opportunities
- A/B: native card copy variants via config weights  
- Auto-hide if `document.visibilityState` practice active  
- Analytics events: `ad_impression`, `ad_click`, `ad_suppressed_pro`  
- Kill switch remote later via Worker JSON (optional)

### Privacy & a11y
- Label slots `aria-label="Sponsored"` / “Recomendación”  
- Respect `prefers-reduced-motion` (no autoplay video)  
- Disclose affiliate relationships in foot note  
- Cookie/consent banner if EU traffic + AdSense  

### Phase 5 retrospection
Scaffold is production-safe: off by default, Pro suppresses, no practice-path injection.

---

# Phase 6 — Validation, Risk & Recommendations

### Pre-round research
Long-term: aggressive ads ↑ short revenue, ↓ retention & brand; Duo uses ads as conversion stick while keeping free useful.

### Risk register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Interrupt practice → churn | P0 | Hard ban during Empezar |
| Ads kill Pro conversion | P1 | Ad-free Pro + better tools still primary value |
| AdSense rejection / GH ToS | P2 | Native-first; keep site education-primary |
| Low revenue disappointment | P2 | Set expectation: Pro &gt; ads early |
| Affiliate FTC disclosure | P2 | Label sponsored; honest copy |
| Third-party script perf | P1 | Lazy load; native default |
| Audio ad conflict | P0 | No autoplay sound |

### Validation checklist
- [x] Research multi-source 2025–2026  
- [x] Product audit free vs Pro  
- [x] Strategy protects free practice  
- [x] Technical scaffold off-by-default  
- [ ] Live enable only after operator review  
- [ ] A/B retention after enable (sessions/user)

### Prioritized recommendations

| Priority | Action | Why |
|----------|--------|-----|
| **P0** | Finish Stripe/MP go-live (ST-01/02) | One Pro ≫ display ads |
| **P0** | Keep practice ad-free path sacred | Product identity |
| **P1** | Enable **native studio cards** when ready | Passiveive + contextual |
| **P1** | Market Pro as **ad-free + coach tools** | Conversion stick |
| **P2** | AdSense after traffic + policy pages | Scale free MAU |
| **P3** | Rewarded opt-in experiments | Only with analytics |

### Phase 6 retrospection
Strategy increases **total** monetization potential without sacrificing learning quality if P0 subscription path remains primary.

---

# Phase 7 — Final Report & Documentation

### Executive summary
1. Users tolerate **post-task, low-density** ads; hate mid-lesson traps.  
2. Education economics favor **subscriptions**; display RPM on small SPA is often trivial.  
3. Optimal early stack: **Free practice forever + native/affiliate tips + Pro (ad-free + coach tools)**.  
4. Technical layer is scaffolded **off by default** (`js/ads.js`).  
5. Do **not** copy Duolingo ad frequency until retention metrics prove room.

### Deliverables map
| Doc / code | Role |
|------------|------|
| This file | Full orchestration Phases 0–7 |
| `AD-MONETIZATION-REGISTRY.md` | Living decisions & gaps |
| `js/ads-config.js` / `js/ads.js` | Implementation scaffold |
| `10-SUBSCRIPTIONS.md` | Pro / payment (primary revenue) |

### Sources (selected)
1. https://www.businessofapps.com/data/education-app-market/  
2. https://adapty.io/blog/education-app-subscription-benchmarks/  
3. https://www.revenuecat.com/state-of-subscription-apps-2026-education/  
4. https://www.digitalapplied.com/blog/display-advertising-benchmarks-2026-data-points  
5. https://innopanda.com/google-adsense-in-2026/  
6. https://optidigital.com/resources/blog/top-ad-formats-for-publishers-in-2025/  
7. https://muhammadjubairhasan.medium.com/business-case-study-duolingo-gamifying-education-and-building-a-habit-forming-empire-ba1d81411848  
8. https://nerdsip.com/blog/best-free-learning-apps-2026  
9. https://www.reddit.com/r/learndutch/comments/1iet1cz/  
10. https://github.com/orgs/community/discussions/186793  
11. https://uxdesign.cc/how-duolingo-pushes-users-from-freemium-to-premium-4b9fe8bbb21a  
12. Product prior art: `docs/14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md`

### Phase 7 retrospection
Research complete; strategy actionable; code scaffold ready; **enablement is an operator decision** after subscription links live.
