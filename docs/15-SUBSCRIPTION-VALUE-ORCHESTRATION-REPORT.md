# Subscription Value Orchestration Report  
## Phases 0–8 · Evidence-Based · Product-Validated

**Product audited:** Vocal Studio / PillB (GitHub Pages SPA) — *not* a Python course.  
**Date:** 2026-07-16  
**Method:** Multi-role research + full codebase audit + gap registry + implementation fixes  

Related docs:  
- [`14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md`](./14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md)  
- [`10-SUBSCRIPTIONS.md`](./10-SUBSCRIPTIONS.md)  
- [`VALUE-GAP-REGISTRY.md`](./VALUE-GAP-REGISTRY.md)

---

# Phase 0 — Setup preamble & Evidence-Based Subscription Value Playbook

### Preamble
Research the most effective, evidence-backed ways to encourage subscriptions and deliver/show value in online education/skill services — then bind every later recommendation to that playbook.

### 0.1 Research rounds (summary)

#### A. Hormozi / Grand Slam Offers
**Formula (widely cited from *$100M Offers*):**  
`Value = (Dream Outcome × Perceived Likelihood of Achievement) / (Time Delay × Effort & Sacrifice)`

**Key principles with sources:**
| Principle | Evidence | Quote / takeaway |
|-----------|----------|------------------|
| Grand Slam Offer | Greg Faxon summary of Hormozi | “Cannot be compared to any other product… attractive promotion, unmatchable value, premium price, unbeatable guarantee” · [gregfaxon.com](https://www.gregfaxon.com/blog/100m-offers-summary) |
| Stack bonuses | LinkedIn / Hormozi summaries | “A single offer is less valuable than the same offer broken into its component parts and stacked as bonuses.” · [LinkedIn pulse](https://www.linkedin.com/pulse/100m-offers-how-make-so-good-people-feel-stupid-saying-jeffrey-davis-bj3of) |
| Raise numerator / cut denominator | Power Moves summary | Dream outcome + likelihood up; time delay + effort down · [thepowermoves.com](https://thepowermoves.com/100-million-offers-summary-review/) |
| Risk reverse | Hormozi offer enhancers | Guarantees, scarcity, urgency — **only if true** (fake scarcity destroys likelihood) |

#### B. Freemium conversion economics
| Finding | Source | Implication for us |
|---------|--------|-------------------|
| Freemium→paid often **~2–5%** | Industry freemium reports (First Page Sage / SaaS literature) | Don’t panic; optimize quality of converters |
| Hybrid freemium (feature + usage) beats pure feature gates | American Impact Review hybrid freemium case | Soft-gate **export/insights**, not Empezar |
| Time-to-value &lt;5 min | PLG / freemium conversion guides | Protect first Empezar path |
| Reverse trial / full Pro early | Userpilot reverse-trial pattern | Our 7-day Pro trial is structurally right |

#### C. Psychology & neuroscience (ethical)
| Framework | Source | Use ethically |
|-----------|--------|----------------|
| Self-Determination Theory (autonomy, competence, relatedness) | Ryan & Deci tradition (product literature) | Free autonomy; show competence via pulse/highway; relatedness via coach language |
| Hook Model (Trigger → Action → Variable Reward → Investment) | Nir Eyal *Hooked* · [yukaichou.com analysis](https://yukaichou.com/gamification-analysis/hook-model-octalysis-habit-addiction/) | Empezar habit; pitch quality as variable reward; investment = sessions/export |
| BJ Fogg B=MAP | Behavior Model | Make ability high (1-nota default, range auto, tours) |
| Loss aversion / sunk cost | F2P monetization literature (arXiv mobile game study) | Surface progress *to protect via export*, not guilt-trip |

#### D. Gaming mechanics for education (not dark patterns)
| Pattern | Success case | Ethical adaptation |
|---------|--------------|-------------------|
| Streaks | Duolingo: 7-day streak learners **3.6×** more likely to complete course · [blog.duolingo.com](https://blog.duolingo.com/how-duolingo-streak-builds-habit/) | We show streak on value pulse — never sell “streak repair” as guilt |
| Upgrade after high engagement | Duolingo Super after milestones / hearts · [UX Collective](https://uxdesign.cc/how-duolingo-pushes-users-from-freemium-to-premium-4b9fe8bbb21a) | Soft banners after sessions / hold PR / trial D-2 |
| Free core + paid convenience | ~8% pay, 80%+ revenue from subs · [BBC Worklife](https://www.bbc.com/worklife/article/20241004-the-simple-formula-that-made-duolingo-a-daily-habit-for-millions) | Free practice forever; Pro = coach tools |

#### E. Educational subscription platforms
| Platform | Pattern | Adaptation |
|----------|---------|------------|
| Coursera Plus | Unlimited catalog + outcome language (“what subscribers achieve”) · [coursera.org/courseraplus](https://www.coursera.org/courseraplus) | Sell **outcomes** (clearer speaking / freer singing), not JSON |
| Skillshare | Flat unlimited access vs per-course | Our unlimited free catalog is already stronger than many freemium skill apps |
| MasterClass | Premium identity + annual | Yearly hero + lesson-price anchor |

#### F. Real user feedback (singing / music apps)
| Sentiment | Source | Product rule |
|-----------|--------|--------------|
| Hate paywalled practice minutes | r/yousician free vs premium · limited free time | **Never** time-cap Empezar |
| Compare price to private lessons | r/singing, Yousician pricing debates | Anchor Pro yearly &lt; 1 lesson |
| Want real feedback, not vibes | r/singing on apps | Highway + cents + holds &gt; opaque “AI coach” |
| Free tuners “enough” for some | r/singing free app threads | Differentiate with **dual track + plan + modes**, not pitch alone |
| Yousician Premium ~€20/mo song library | Kunstplaza Yousician review | We compete on **skill system + oratory**, not 10k songs |

### 0.2 Evidence-Based Subscription Value Playbook (operating rules)

1. **Dream outcome first** — identity result in every Pro surface.  
2. **Deliver aha free** — full workflow free (Duolingo/Tinder Plus pattern).  
3. **Show competence continuously** — progress board, not only after pay.  
4. **Ask at success, not at pain** — milestone upsells after wins.  
5. **Only market what ships** — broken claims destroy *likelihood of achievement*.  
6. **Anchor to alternative cost** — private lesson, not competitor feature table alone.  
7. **Ethical game loops** — skill feedback OK; compulsive monetization not OK.  
8. **Dual rail LATAM + global** — Mercado Pago + Stripe.  
9. **Yearly is the hero LTV plan.**  
10. **Measure:** trial→paid, banner→pricing, export usage, weekly active free.

### Phase 0 retrospection
Research depth is strong on Hormozi, Duolingo, freemium, and singing-app forums. Less primary neuroscience papers cited than popular syntheses — playbook still conservative and ethical. **Product binding is Vocal Studio**, not Python (prompt mismatch noted and corrected).

---

# Phase 1 — Feature & Current State Audit

### Preamble
Map every value-bearing element of the actual SPA for SHOWING vs DELIVERING analysis.

### 1.1 Inventory (code-validated 2026-07-16)

| Dimension | Count |
|-----------|------:|
| Exercises | **36** (vocal 20 · singing 16) |
| Tiers | basic 14 · advanced 22 |
| Practice modes | **33** unique |
| Piano progressions | 11 |
| Week-plan elements | 17 |
| Views | home · exercise · history · plan |
| Billing plans | free · pro_monthly · pro_yearly |
| Payment rails | Stripe · Mercado Pago (**links empty**) |
| Tour packs | home + highway/hold/speech |

**Full mode list:**  
`rateLadder, metronomeSpeech, volumeSteady, volumeLadder, countPace, articulationContrast, recordOnly, facePhases, speechEnergy, reviewSession, weekPlan, pauseDetect, fillerDetect, keyPointPace, gestureReps, concisionGate, storyTimer, authorityLand, energyMatch, pitchContour, pitchHold, pitchChord, pitchSong, pitchMatch, sovtFlow, humTargets, sirenRange, breathS, shAirLadder, scaleSteps, dynamicSwell, staccatoLegato, onsetReps`

### 1.2 Free vs Pro matrix (as implemented)

| Capability | Free | Pro |
|------------|:----:|:---:|
| All exercises + Empezar | ✅ | ✅ |
| Pitch highway / piano / range auto | ✅ | ✅ |
| Record + local history | ✅ | ✅ |
| 12-week plan | ✅ | ✅ |
| Value pulse stats | ✅ | ✅ |
| Export JSON + coach .txt | ❌ | ✅ |
| Pro insights narrative | teaser | ✅ |
| Multi-profile | ❌ not built | ❌ was marketed → **fixed to not claim** |
| Priority progressions | free already | **removed from Pro list** |

### 1.3 Current Value Delivery Map

| Layer | Delivered | Shown |
|-------|-----------|-------|
| Practice studio | Very strong | Strong |
| Progress proof | Strong (pulse) | Strong |
| Onboarding | Strong (tours) | Strong |
| Subscription identity | Soft local trial | Strong modal |
| Paid rails | Not live | Prices shown |
| Coach OS | Thin (export + narrative) | Was over-claimed → corrected |

### Phase 1 retrospection
Audit is exhaustive at exercise/mode/UI level. Weakest area is **Pro uniqueness**, not free practice quality.

---

# Phase 2 — Value Gap Analysis

### Preamble
Compare Current Value Delivery Map to the Playbook.

### 2.1 Scorecard vs Playbook

| Playbook rule | Score | Gap root cause |
|---------------|:-----:|----------------|
| Dream outcome first | B | Pricing improved; home hero still track-focused not outcome-focused |
| Aha free | A | Correct architecture |
| Show competence | A− | Pulse exists; no sparkline/trend over weeks |
| Ask at success | B+ | Soft banners exist; trial always-on blurs free baseline |
| Market only what ships | C→A | Over-claim multi_profile / priority_progressions — **honest packaging fix applied** |
| Lesson anchor | A | In pricing + value CTA |
| Ethical game loops | A | Highway/combo/holds free |
| Live payments | F | Empty Payment Links |
| Yearly hero | B+ | Hero card; weak yearly-only bonuses |
| Measurement | D | No analytics pipeline |

### 2.2 Prioritized Value Gap Report

| ID | Gap | Root cause | Impact | Priority |
|----|-----|------------|--------|----------|
| VG-01 | Payment links empty + demo unlock | Pre-launch config | Blocks real revenue | **P0** |
| VG-02 | Pro over-promised undelivered features | Marketing ahead of build | Trust / likelihood ↓ | **P0** (fixed packaging) |
| VG-03 | Pro uniqueness thin after trial | Free is intentionally rich | Conversion ceiling | **P1** |
| VG-04 | Multi-profile not built | Storage single-key | Family/coach segment lost | **P1** |
| VG-05 | Insights = aggregate text only | No trend engine | Weak “coach” claim | **P1** |
| VG-06 | Trial auto-starts for all | Aggressive reverse trial | Hard to feel “free vs Pro” | **P2** |
| VG-07 | Plan weakly coupled to completions | Manual week UI | Habit likelihood ↓ | **P2** |
| VG-08 | No email / account-bound Pro | GH Pages local storage | Share/leak entitlement | **P2** |
| VG-09 | Vocal advanced modes often tap-self-report | Pedagogy choice | “AI coach” expectation miss | **P2** |
| VG-10 | No public social proof on home | Early product | Likelihood of achievement ↓ | **P2** |
| VG-11 | Competitor comparison not on pricing | Positioning incomplete | Differential value unclear | **P2** |
| VG-12 | Analytics absent | Static SPA | Can’t optimize funnel | **P1** |

### Phase 2 retrospection
Largest conversion blocker is **VG-01 (live payments)**. Largest *trust* blocker was **VG-02** (now mitigated by honest feature lists + real coach .txt export).

---

# Phase 3 — Success Cases & Best Practices

### Preamble
Extract patterns from platforms that solved similar freemium skill problems.

| Case | What they did | Pattern to copy | Pattern to avoid |
|------|---------------|-----------------|------------------|
| **Duolingo Super** | Free learning forever; pay for convenience (hearts, offline, streak tools); ~8% convert · [BBC](https://www.bbc.com/worklife/article/20241004-the-simple-formula-that-made-duolingo-a-daily-habit-for-millions) | Free core + pay for *power tools* | Aggressive guilt monetization of streaks |
| **Duolingo growth** | Streak science · [Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit/) | Surface streak; celebrate 7-day | Sell “repair” as primary revenue |
| **Tinder Plus inspiration** | Free core match; pay friction reduction | Same freemium philosophy | N/A |
| **Yousician** | Free limited time; Premium song library · forum price pushback | Don’t copy time caps | €20/mo without song catalog we don’t have |
| **Coursera Plus** | Outcome language + unlimited catalog · [Coursera Plus](https://www.coursera.org/courseraplus) | “What you achieve” framing | Credential spam we can’t issue |
| **Hormozi gym stacks** | Bonuses named separately | Stack: Export + Insights + Coach.txt + Trial | Fake bonuses |

### Phase 3 retrospection
Duolingo is the closest freemium *skill* analogue; Yousician is the closest *domain* competitor. We should win on **unlimited free practice + dual vocal/singing + transparent feedback**, monetize **coach portability**.

---

# Phase 4 — Improvement Design per Area

### Preamble
Concrete improvements by surface, validated against actual product capabilities.

### 4.1 Prioritized Improvement Roadmap

| # | Area | Improvement | Playbook lever | Effort | Impact | Status |
|---|------|-------------|----------------|--------|--------|--------|
| 1 | Payments | Paste Stripe/MP links; `demoUnlockEnabled:false` | Likelihood | S | Critical | **Open P0** |
| 2 | Pricing honesty | Only list shipped Pro features | Likelihood | S | High | **Done** |
| 3 | Coach pack | Dual download JSON + .txt summary | Dream + bonus stack | S | Med-High | **Done** |
| 4 | Value pulse | Already live | Competence | — | High | **Done** |
| 5 | Soft milestones | Already live | Ask at success | — | Med | **Done** |
| 6 | Multi-profile | Real local slots + switcher | Pro uniqueness | L | High | Roadmap P1 |
| 7 | Insights v2 | 4-week sparkline + weakest skill tip | Coach claim | M | High | Roadmap P1 |
| 8 | Plan coupling | “This week’s focus exercise” CTA from plan | Habit | M | Med | Roadmap P2 |
| 9 | Home outcome hero | One sentence dream outcome under track title | Dream | S | Med | Roadmap P1 |
| 10 | Social proof strip | 3 anonymized outcome lines + method | Likelihood | S | Med | Roadmap P2 |
| 11 | Competitor matrix | Free forever vs Yousician time cap | Differential | S | Med | Roadmap P2 |
| 12 | Analytics | Plausible/GA4 events: start, save, pricing, export | Measure | M | High | Roadmap P1 |
| 13 | Trial UX | Explicit “Trial day N/7” on Pro pill | Transparency | S | Med | Partial (tag) |
| 14 | Yearly bonuses | “Yearly: 2 coach exports / month reminder” | Stack | S | Med | Roadmap P2 |
| 15 | Account-bound Pro | License code after Stripe webhook | Anti-share | L | High | Roadmap P2 |

### Phase 4 retrospection
Highest ROI is still **go live on payments** + **honest Pro uniqueness buildout**, not more free drills.

---

# Phase 5 — User Journey & Funnel Optimization

### Preamble
Map current vs improved journeys for free→trial→paid→habit.

### 5.1 Current funnel (as built)

```
Land (ES)
  → optional Home Tour
  → Value Pulse (often empty)
  → Pick track / tier / card OR structured session
  → Exercise UI Tour (first layout family)
  → Empezar (mic + optional piano)  ← AHA
  → Practice (highway / mode detectors)
  → Stop → Save metrics
  → Soft value banner (success)
  → Pro modal (dream + personal stats + rails)
  → [BLOCKED] empty payment links → demo Pro
```

### 5.2 Improved target funnel

```
Land
  → Outcome hero: “Voz clara y afinada en 12 semanas de práctica guiada”
  → 60s path: “Prueba ahora” → first basic exercise auto-open
  → Empezar aha < 30s (1-nota, auto range)
  → Session 1 save → celebrate competence on pulse
  → Session 3 → soft: “Exporta tu prueba para un coach”
  → Pricing: Free forever practice | Pro coach pack
  → Live Stripe/MP
  → Return: Pro insights + export button glow
  → Week 1 plan element suggested from last exercises
  → Day 6 trial: transparent countdown + one-click yearly
```

### 5.3 Persona journeys (Validator input)

| Persona | Free value | Conversion trigger | Risk |
|---------|------------|--------------------|------|
| Shy beginner singer | Highway + 1-nota + range | Export for teacher | Overwhelmed by HUD → tours help |
| Corporate speaker | Vocal advanced modes | 12-week plan export | Self-report modes feel soft |
| Parent / coach | Multi-profile (future) | Family slots | Currently no multi-profile |
| LATAM user | ES UI + MP rail | Local payment trust | Empty MP link |

### Phase 5 retrospection
Funnel structure is sound; **payment hole** and **thin Pro** are the conversion bottlenecks, not aha.

---

# Phase 6 — Validation & Evidence Check

### Preamble
Simulate users and cross-check every major recommendation against research + code.

### 6.1 User simulations

| Simulation | Result | Fix |
|------------|--------|-----|
| “I only want free pitch practice” | Fully served | Keep free — Duolingo rule |
| “Why pay if everything free?” | Valid — Pro must be *coach tools* | Honest packaging + future multi-profile |
| “Pro says multi-profile but nothing there” | Trust break | **Removed from marketing list** |
| “Trial ends, I lose Empezar?” | Fear | Copy: practice always free |
| “Is this worth vs $80 lesson?” | Yearly $79 wins | Keep lesson anchor |
| PE user wants Yape | Needs live MP | P0 payments |

### 6.2 Evidence cross-check

| Recommendation | Evidence | Product fit |
|----------------|----------|-------------|
| Free unlimited practice | Reddit hate of time caps; Duolingo free core | ✅ Already |
| Success-moment upsell | Duolingo milestone / Userpilot | ✅ Soft banners |
| Lesson-price anchor | Forum price comparisons | ✅ Live |
| Honest feature list | Hormozi likelihood of achievement | ✅ Fixed |
| Live payments | Table stakes SaaS | ❌ Open |
| Streak display | Duolingo 3.6× completion | ✅ Pulse |
| No loot monetization | F2P ethics literature | ✅ |

### 6.3 Remaining weaknesses (RCA)
1. **Economic:** Free product may be “too good” relative to Pro — intentional for trust; fix by building real Pro depth, not crippling free.  
2. **Technical:** Local-only entitlement can’t scale paid.  
3. **Positioning:** Still under-communicate dual-track uniqueness vs pure singing apps.

### Phase 6 retrospection
No recommendation contradicts free-first freemium evidence. Dark-pattern monetization rejected.

---

# Phase 7 — Final Recommendations & Implementation Guidance

### Preamble
Consolidate Fixer-ready actions.

### 7.1 Do this week (P0)
1. Create Stripe Payment Links (monthly + yearly) → paste into `billing-config.js`.  
2. Create Mercado Pago plans for PE → paste links.  
3. Set `demoUnlockEnabled: false` in production.  
4. Success URL: `?billing=success&plan=pro_monthly&provider=stripe` (already handled).  
5. Keep honest Pro feature list (export, insights, coach summary).

### 7.2 Do this month (P1)
1. Multi-profile local slots (2–3 voices).  
2. Insights v2: weakest skill + 4-week trend from storage.  
3. Home outcome hero line (i18n).  
4. Plausible/GA4: `practice_start`, `session_save`, `pricing_open`, `checkout_click`, `export`.  
5. Competitor strip on pricing: “Yousician free is time-capped · We aren’t.”

### 7.3 Messaging kit (ES/EN)

**Primary positioning**  
- ES: *Practica gratis siempre. Pro es para llevar tu prueba a un coach.*  
- EN: *Practice free forever. Pro is for taking your proof to a coach.*

**Dream outcome**  
- ES: *Voz clara al hablar y afinada al cantar — con un plan de 12 semanas.*  
- EN: *A clear speaking voice and freer singing pitch — with a 12-week plan.*

**Objection handlers**  
| Objection | Response |
|-----------|----------|
| Why pay? | Export + coach summary + insights; practice stays free |
| Too expensive | Yearly &lt; one private lesson |
| Apps suck | Transparent highway + dual track + research-backed exercises |

### 7.4 Already implemented (this orchestration cycle + prior)
- Value pulse, soft banners, pricing value stack, lesson anchor  
- Honest Pro features + dual file export (JSON + coach .txt)  
- Range adapter, 1-nota default, UI tours  

### Phase 7 retrospection
Recommendations are implementation-ready; no dependency on unbuilt Python-course metaphors.

---

# Phase 8 — Final Report (Executive)

### Executive summary
Vocal Studio already delivers a **best-in-class free practice studio** (36 exercises, 33 modes, highway, piano, range auto, dual track). That is a **strategic asset** for acquisition and trust — matching Duolingo-style freemium, not Yousician-style time caps.

Subscription growth is currently blocked by:  
1) **non-live payments**,  
2) historically **over-marketed Pro features**,  
3) **thin unique Pro depth** beyond export/insights.

Fixes applied in this cycle: **honest packaging**, **real coach .txt pack**, full **research orchestration report** + **value-gap registry**.

### Highest-impact opportunities (ranked)
1. **Go live Stripe + Mercado Pago** (P0)  
2. **Ship multi-profile + insights v2** (P1) — make Pro a real second product  
3. **Analytics** on funnel steps (P1)  
4. **Outcome hero + social proof** (P1–P2)  
5. **Never paywall Empezar** (strategic constraint)

### Expected impact (directional)
| Move | Expected effect |
|------|-----------------|
| Live checkout | Unlocks any paid conversion |
| Honest Pro | Higher trial→paid *quality* / fewer refunds |
| Multi-profile | Opens family/coach segment |
| Soft success upsells | Higher pricing_open rate without free-user anger |
| Yearly hero + lesson anchor | Higher LTV mix |

### Sources (selected)
1. Hormozi value equation summaries — [thepowermoves.com](https://thepowermoves.com/100-million-offers-summary-review/), [gregfaxon.com](https://www.gregfaxon.com/blog/100m-offers-summary)  
2. Bonus stacking quote — [LinkedIn](https://www.linkedin.com/pulse/100m-offers-how-make-so-good-people-feel-stupid-saying-jeffrey-davis-bj3of)  
3. Duolingo freemium revenue — [BBC](https://www.bbc.com/worklife/article/20241004-the-simple-formula-that-made-duolingo-a-daily-habit-for-millions)  
4. Duolingo streak research — [blog.duolingo.com](https://blog.duolingo.com/how-duolingo-streak-builds-habit/)  
5. Duolingo freemium→premium UX — [UX Collective](https://uxdesign.cc/how-duolingo-pushes-users-from-freemium-to-premium-4b9fe8bbb21a)  
6. Hook Model / Fogg — [yukaichou.com](https://yukaichou.com/gamification-analysis/hook-model-octalysis-habit-addiction/), Nir Eyal *Hooked*  
7. Coursera Plus outcomes framing — [coursera.org/courseraplus](https://www.coursera.org/courseraplus)  
8. Yousician free limits / pricing — [Kunstplaza](https://www.kunstplaza.de/en/music/singing-lesson-app-singing-teacher-comparison/), Reddit r/yousician, r/singing  
9. Freemium conversion ranges — industry freemium SaaS reports (First Page Sage / SaaS literature ~2–5% freemium→paid)  
10. Internal product audit — codebase 2026-07-16 (exercises-data, practice-profiles, billing, value-pulse)

### Closing retrospection (orchestration)
The multi-agent process completed Phases 0–8 against the **real Vocal Studio product**. Prompt references to a Python course (52 sections, exams, CodePlayground) were **out of scope** for this repo and correctly remapped. Success criteria met: evidence links, full feature audit, gap registry, roadmap, funnel maps, and concrete packaging fixes shipped.
