# User Insights & Feature Discovery Orchestration  
## Phases 0–7 · Evidence-backed · Vocal Studio (PillB)

**Product audited:** Vocal Studio SPA (dual vocal + singing tracks) — *not* a Python course.  
**Date:** 2026-07-16  
**Related:** [`17-RETENTION-AND-REMINDERS-RESEARCH.md`](./17-RETENTION-AND-REMINDERS-RESEARCH.md) · [`15-SUBSCRIPTION-VALUE-ORCHESTRATION-REPORT.md`](./15-SUBSCRIPTION-VALUE-ORCHESTRATION-REPORT.md) · [`USER-INSIGHT-REGISTRY.md`](./USER-INSIGHT-REGISTRY.md)

---

# Phase 0 — User Insights & Feature Discovery Playbook

### Pre-round research
- EdTech retention case work (onboarding → first lesson → milestones → pause vs cancel) · [loyalty.cx EdTech churn study](https://loyalty.cx/edtech-churn-rate/)  
- Subscription app benchmarks · [RevenueCat State of Subscription Apps 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)  
- Freemium tier design · [RevenueCat freemium](https://www.revenuecat.com/blog/growth/freemium-tier-design/)  
- Habit/retention messaging · push opt-in quality over volume · [Airship](https://www.airship.com/blog/push-notification-strategy-customer-retention/)  
- Social listening practice: mine **complaint + praise** threads in domain communities (r/singing, r/duolingo, r/productivity), not only product subreddits

### Preamble
Establish methods to find what users **say** they love vs what **drives return**, then map to subscription value for a skill-practice SPA.

### Playbook (operative rules)

| # | Rule | Rationale |
|---|------|-----------|
| 1 | **Mine pain + delight separately** | Praise ≠ retention driver; complaints often reveal true barriers |
| 2 | **Quote + link every theme** | Prevents invented personas |
| 3 | **Separate free habit vs paid power tools** | Duolingo Super pattern: free core, paid convenience |
| 4 | **Tone is product** | Guilt copy increases uninstalls (r/duolingo) |
| 5 | **Short sessions beat content volume** | r/singing consistency threads |
| 6 | **Progress theater must be real** | “Same song later” emotion needs real scores/history |
| 7 | **Ship before sell** | Hormozi likelihood of achievement |
| 8 | **Measure D1/D7 practice, not only opens** | EdTech case study focus on first lesson completion |

### Habit science (condensed)

| Mechanism | User language | Product lever |
|-----------|---------------|---------------|
| Cue | “I forgot to practice” | Reminders, calendar, welcome-back |
| Tiny action | “I only have 10 minutes” | Micro-session 5 min |
| Variable reward | Pitch quality / combo | Highway feedback (free) |
| Investment | Streaks, exports, plan | Value pulse, coach pack (Pro) |
| Competence | “I can hear improvement” | Score compare, holds |

### Phase 0 retrospection
Playbook prioritizes **authentic community language** over feature laundry lists. Domain for this product is **voice practice**, not coding LMS.

---

# Phase 1 — Current Feature & Value Baseline

### Pre-round research
Product teardowns of freemium learning apps emphasize: free aha fast, paid = personalization / multi-seat / export / deeper analytics (Yousician Family, Duolingo Super/Max).

### Preamble
Map **what Vocal Studio already delivers** so new ideas don’t reinvent shipped value.

### Baseline inventory (code, 2026-07-16)

| Layer | Count / status |
|-------|----------------|
| Exercises | 36 (vocal 20 · singing 16) |
| Practice modes | 33 |
| Free core | Highway, piano, range auto, plan, record, value pulse |
| Pro studio | Multi-profile ≤3, insights v2, weekly goals, achievements, Pro progs, export |
| Retention (shipped `3441f7f`) | Kind reminders, ICS, welcome-back, freezes, micro-session, score compare |
| Billing | Soft local Pro + Payment Links path |

### Value communication surfaces

| Surface | Delivers |
|---------|----------|
| Home value pulse | Sessions, minutes, streak, hold, exercises |
| Pro studio | Profiles, goals, sparkline, coach focus, badges |
| Retain panel | Reminders, calendar, 5 min, freezes |
| Pricing modal | Dream outcome, personal proof, honest Pro list |
| Exercise cockpit | Live practice (primary aha) |

### Phase 1 retrospection
Baseline is **strong free practice + expanding Pro + new retention chrome**. Gap is less “no features” than **discoverability, measurement, and deeper habit loops**.

---

# Phase 2 — User Feedback Across Platforms

### Pre-round research
Active communities: r/singing, r/duolingo, r/productivity, r/languagelearning, Product Hunt edtech, app reviews. Search patterns: “worth it”, “keep using”, “streak”, “notification”, “cancel”, “practice consistent”.

### Preamble
Gather authentic voices on return drivers and subscription friction.

### Theme map with evidence

#### Theme A — Consistency is the hard problem
> “I'll go for long periods without practice then when I get the motivation I'll practice nonstop for a week or two then fall off the wagon.”  
— [r/singing](https://www.reddit.com/r/singing/comments/1aumx9i/does_anyone_else_have_trouble_getting_consistent/)

> Even 10 minutes of scales daily improves dramatically.  
— [r/singing](https://www.reddit.com/r/singing/comments/byuevr/if_youre_constantly_practicing_youre_improving/)

**Insight:** Users need **re-entry + micro-commitment**, not more curriculum.

#### Theme B — Progress visibility is addictive (positive)
> Same song one year later posts get strong engagement.  
— [r/singing](https://www.reddit.com/r/singing/comments/1i9mi9z/singing_the_same_song_1_year_apart_progress_after/)

**Insight:** Score compare / hold history / coach export create **emotional ROI**.

#### Theme C — Reminders help *if* kind; guilt backfires
> “Your streak is about to end… makes me feel worse. Like I'm failing at life.”  
— [r/duolingo](https://www.reddit.com/r/duolingo/comments/1qkx0p6/notifications_like_this_are_the_worst/)

> Condescending notifications / monetized freezes breed resentment.  
— [r/duolingo](https://www.reddit.com/r/duolingo/comments/1hgj15n/duolingo_is_deteriorating_fast/)

**Insight:** **Opt-in + supportive tone + calendar control** > Duo-style shame.

#### Theme D — Streaks are double-edged
- Pride and identity (long streaks celebrated on social).  
- Pressure rejected: users build anti-streak habit apps · [r/iosapps](https://www.reddit.com/r/iosapps/comments/1rf2fss/).

**Insight:** Keep streaks; add **freezes + weekly goals** as pressure valves.

#### Theme E — Social / friend streaks polarize
> Friend streak alerts “are the enemy.”  
— [r/duolingo](https://www.reddit.com/r/duolingo/comments/1hdfif0/friend_streak_alerts_are_the_enemy/)

**Insight:** No forced social nag; optional private share only.

#### Theme F — Paid content skepticism (singing)
Apps/courses priced high are often compared unfavorably to YouTube / real teachers (r/singing Singeo / 30 Day Singer threads).

**Insight:** Monetize **tools + proof + multi-learner**, not video lectures.

#### Theme G — Live tools & confidence
Pitch matching, piano, karaoke confidence apps (Smule) praised when they reduce fear of singing · r/singing Smule/app threads.

**Insight:** Highway + piano free is a **retention engine**; don’t paywall it.

#### Theme H — Industry retention levers
- First-lesson completion lifts D7 · [EdTech case](https://loyalty.cx/edtech-churn-rate/)  
- Pause-not-cancel reduces hard churn  
- Yearly plans retain better · [RevenueCat 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/)  
- Push in first 90 days ~⅓ higher retention · [Airship](https://www.airship.com/blog/push-notification-strategy-customer-retention/)

### Phase 2 retrospection
Strongest voice for **this** product: **consistency tools without guilt + visible progress**. Social coercion and content libraries are secondary.

---

# Phase 3 — Feature Opportunity Report

### Pre-round research
Reminder implementations: OS calendar (ICS), opt-in Notification API, PWA push (needs server). Habit apps: controllable times, no forced daily. Learning apps: Super = convenience; Max = AI (backend).

### Preamble
Expand from reminders to adjacent retention features; tag **shipped vs next**.

### Opportunities

| ID | Feature | User evidence | Sub value | Status |
|----|---------|---------------|-----------|--------|
| F-01 | Kind practice reminders | Theme C | Free habit | **Shipped** |
| F-02 | ICS calendar export | Controllable routines | Free habit | **Shipped** |
| F-03 | Welcome-back re-entry | Theme A | Free habit | **Shipped** |
| F-04 | Micro-session 5 min | Theme A | Free habit | **Shipped** |
| F-05 | Gentle streak freezes | Themes C–D | Free + Pro extra | **Shipped** |
| F-06 | Score compare | Theme B | Free; Pro export | **Shipped** |
| F-07 | Multi-profile | Yousician Family | Pro | **Shipped** |
| F-08 | Insights sparkline + coach focus | Analytics praise | Pro | **Shipped** |
| F-09 | Weekly goals | Flexible consistency | Free view / Pro set | **Shipped** |
| F-10 | Achievements | Competence | Free earn / Pro export | **Shipped** |
| F-11 | Year heatmap of practice | Habit apps | Free | **Shipped** (26-week map) |
| F-12 | Pause subscription UX | EdTech pause study | Billing | **Next** (ops) |
| F-13 | True Web Push (PWA) | Airship | Free opt-in | **Next** (needs Worker) |
| F-14 | “Same exercise A/B audio” | Theme B | Free in History | **Shipped** |
| F-18 | Local analytics events | Measure D1/D7 | Free | **Shipped** (`VTAnalytics`) |
| F-15 | Soft accountability share link | Polarized social | Pro optional | **Later** |
| F-16 | AI coach roleplay | Duolingo Max | High tier | **Later** (API) |
| F-17 | Email weekly digest | Lifecycle marketing | Pro | **Later** (backend) |

### Phase 3 retrospection
Most high-evidence habit features **already shipped in-product**. Next differentiation is **visualization (heatmap), true push, audio compare, billing pause**.

---

# Phase 4 — Value Impact & Subscription Alignment

### Pre-round research
- Free habit tools → acquisition & D7 ([EdTech case](https://loyalty.cx/edtech-churn-rate/))  
- Paid multi-seat / export / insights → conversion at “outgrown free” ([RevenueCat freemium](https://www.revenuecat.com/blog/growth/freemium-tier-design/))  
- Yearly attach → LTV ([RevenueCat 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/))

### Impact matrix

| Feature cluster | Retention | Conversion | Differentiation | Feasibility |
|-----------------|-----------|------------|-----------------|-------------|
| Kind reminders + ICS + micro + welcome-back | **High** | Low direct | Medium (tone) | Done |
| Freezes + weekly goals | High | Medium | Medium | Done |
| Multi-profile + export + insights | Medium | **High** | High | Done |
| Heatmap + audio A/B | High | Medium | High | Medium |
| Web Push | High | Low–Med | Medium | Needs Worker |
| AI Max-tier | Medium | High price | High | Hard |

### Subscription positioning (validated)

| Tier | Promise | User language fit |
|------|---------|-------------------|
| **Free** | Practice forever; form the habit | “I need to stay consistent” |
| **Pro** | Coach pack, multi-voice, deeper insights, extra freezes/reminders | “I train others / I want proof for my teacher” |
| **Yearly** | Best LTV; lesson-price anchor | “Better than one private lesson” |

### Phase 4 retrospection
Do **not** move Empezar or highway behind paywall. Pro wins on **portability + multi-learner + analytics depth**.

---

# Phase 5 — User Journey Integration

### Pre-round research
Onboarding → first success → habit cue → re-engagement → upgrade at success moments (prior docs 14–15).

### Target journey (current product)

```
Land → Tour (optional)
  → Value pulse + Retain panel (reminders/ICS)
  → Empezar aha < 2 min
  → Save session → score compare
  → Weekly goal / streak / freezes
  → Gap ≥2 days → Welcome back + micro 5 min
  → Milestone banner → Pro (export, profiles, insights)
  → Checkout (Stripe/MP when configured)
```

### Integration points

| Moment | Feature |
|--------|---------|
| First visit | Tour + free Empezar |
| Daily/weekly | Reminder / ICS / goal progress |
| After save | Compare + achievements |
| After gap | Welcome-back |
| After 3 sessions | Soft Pro (export) |
| Trial D-2 | Transparent trial ending (no guilt) |

### Prioritization for next build

1. **Practice heatmap** (high delight, free)  
2. **Audio before/after same exercise** (Pro or free light)  
3. **Web Push Worker** (when ops ready)  
4. **Analytics events** for D1/D7 practice  

### Phase 5 retrospection
Journey is coherent; measurement instrumentation is the main missing piece.

---

# Phase 6 — Validation & Evidence Check

### Cross-check

| Recommendation | Evidence strength | Conflict |
|----------------|-------------------|----------|
| Kind reminders | Strong (hate guilt + need consistency) | None if opt-in |
| Micro-session | Strong (r/singing) | None |
| No friend streaks | Strong polarization | Some users like social — keep optional later |
| Free core practice | Strong (forum + freemium) | Conversion harder — accepted |
| Multi-profile Pro | Competitor pattern + family use | None |
| AI coach now | Weak for SPA cost/privacy | Defer |

### Weak / uncertain
- Exact lift of ICS vs in-app banner — instrument later  
- Freeze usage rates — instrument  

### Phase 6 retrospection
No recommendation conflicts with primary sources. Shipped retention suite matches Themes A–D.

---

# Phase 7 — Final Prioritized Recommendations

### Executive summary

**Users come back for:** short consistent practice, visible progress, and gentle cues—not more locked content.  
**Users leave or hate products that:** guilt-nag, sell freezes after creating anxiety, or paywall basic practice.  
**Vocal Studio alignment:** free studio + kind retention + Pro coach/multi-profile is the right architecture. Much of the high-evidence set is **already live** (`3441f7f`, `2966c5d`).

### Top recommendations

| Priority | Action | Status |
|----------|--------|--------|
| P0 | Keep free Empezar/highway; live Stripe/MP links | Ops open |
| P0 | Keep kind-only reminder copy | Shipped |
| P1 | Practice **year heatmap** on home | **Shipped** |
| P1 | **Analytics**: practice_start, session_save, reminder_enable | **Shipped** |
| P1 | **Audio A/B** last two recordings per exercise | **Shipped** (History) |
| P2 | Web Push via Worker | When infra ready |
| P2 | Pause-not-cancel messaging when payments live | Billing ops |
| P3 | Optional accountability share | Later |
| P3 | AI Max tier | Later |

### How to measure success

| Metric | Target direction |
|--------|------------------|
| D1 / D7 return-to-practice | ↑ |
| Micro-session starts | ↑ among welcome-back users |
| Reminder enable rate | Opt-in quality > volume |
| Free → Pro at export/profile | ↑ without free churn spike |
| Streak freeze usage without uninstall | Healthy if freezes used + return |

### Subscription messaging (use in Pro modal)

- Free: “Practice forever. Build the habit.”  
- Pro: “Export proof, train multiple voices, deeper insights.”  
- Never: “You’re failing — subscribe.”  

### Sources (selected)
1. https://www.reddit.com/r/singing/comments/1aumx9i/  
2. https://www.reddit.com/r/singing/comments/byuevr/  
3. https://www.reddit.com/r/singing/comments/1i9mi9z/  
4. https://www.reddit.com/r/duolingo/comments/1qkx0p6/  
5. https://www.reddit.com/r/duolingo/comments/1hgj15n/  
6. https://www.reddit.com/r/duolingo/comments/1hdfif0/  
7. https://www.reddit.com/r/iosapps/comments/1rf2fss/  
8. https://www.airship.com/blog/push-notification-strategy-customer-retention/  
9. https://loyalty.cx/edtech-churn-rate/  
10. https://www.revenuecat.com/state-of-subscription-apps-2025/  
11. https://www.revenuecat.com/blog/growth/freemium-tier-design/  
12. https://www.duolingo.com/help/super-duolingo  
13. Internal shipped: commits `2966c5d`, `3441f7f`

### Phase 7 retrospection
Full Phases 0–7 complete for **Vocal Studio**. Prompt references to Python/CodePlayground remapped. Highest-ROI **new** work is heatmap + analytics + audio compare—not more reminders (done).

---

# Validation pass 2 (2026-07-16) — re-orchestration Phases 0–7

### Phase 0 preamble
Refresh methods: mine praise + pain; first-lesson / D1 retention dominates edtech; habit > motivation; kind cues only.

### Phase 0–2 research deltas

| Finding | Evidence | Type |
|---------|----------|------|
| ~85% edtech abandon before week 3; loop breaks before habit | [Digia EdTech engagement](https://www.digia.tech/post/edtech-app-engagement-why-85-percent-abandon-before-week-3/) | Expected |
| Education app D1 ~18.8% vs Duo ~55% | [loyalty.cx retention](https://loyalty.cx/edtech-retention-problem/) | Expected |
| Singers: binge then fall off; 15 min daily > long rare sessions | [r/singing consistency](https://www.reddit.com/r/singing/comments/1aumx9i/), [schedule](https://www.reddit.com/r/singing/comments/1eezmzr/) | Expected |
| Habits outlast motivation | X/lang discourse 2026 | Reinforced |
| Streak engineering = retention engine *and* backlash | Duo case discourse | Surprising intensity already UI-04/05 |

### Phase 1 baseline (current product)

| Free forever | Pro / trial |
|--------------|-------------|
| All exercises, Empezar, highway, piano, range auto | Export coach pack |
| Value pulse, heatmap, kind reminders, ICS, freezes (1) | Multi-profile, goals, extra freezes/reminders |
| Tours, micro-5, welcome-back | Insights sparkline, ad-free when ads on |
| First-win + next-step (this pass) | Portal manage |

### Phases 3–5 prioritization (this pass)

| Priority | Feature | Free/Pro | Status |
|----------|---------|----------|--------|
| P0 | **First-win loop** after 1st save | Free | **Shipped** — celebration + micro / remind / same / next |
| P0 | **Next-step card** on home | Free | **Shipped** — `suggestNextExercise` |
| P1 | True Web Push | Free opt-in | Blocked — needs Worker (UI-13) |
| P1 | Pause subscription path | Pro ops | Documented Stripe portal |
| P2 | Weekly recap narrative | Free / Pro deeper | Later |

### Phase 6 validation
- First-win does **not** hard-sell Pro (copy: habit tomorrow).  
- Next-step reduces choice overload without paywall.  
- Aligns with r/singing consistency + edtech first-session retention.

### Phase 7 implementation
- `index.html` `#next-step-card`, first-win in score result  
- `app.js` `suggestNextExercise`, `totalSessionsSaved`, CTAs  
- i18n ES/EN · CSS · `tests/insights-first-win.spec.js`  
- Registry UI-09 → shipped; UI-17/18/19  

### Sources added
14. https://www.digia.tech/post/edtech-app-engagement-why-85-percent-abandon-before-week-3/  
15. https://loyalty.cx/edtech-retention-problem/  
16. https://www.reddit.com/r/singing/comments/1eezmzr/  
17. https://journals.kmanpub.com/index.php/aitechbesosci/article/view/4724
