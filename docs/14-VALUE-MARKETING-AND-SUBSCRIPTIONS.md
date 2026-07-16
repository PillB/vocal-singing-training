# Value, subscriptions & client outcomes

Research synthesis (marketing, behavioral science, freemium SaaS, ethical game design) applied to **Vocal Studio / PillB** — with product implications and validation of current features.

> Sources: Hormozi value equation ($100M Offers); freemium conversion benchmarks (First Page Sage ~2–5% freemium→paid; reverse-trial & time-to-value literature); self-determination theory (autonomy, competence, relatedness); F2P reinforcement literature (variable reward / loss aversion — **use ethically**); Reddit r/singing / r/yousician (price sensitivity, hate of paywalled core practice, demand for real feedback & progress).

---

## 1. What the evidence converges on

### 1.1 Hormozi value equation (offer design)

\[
\text{Value} \approx \frac{\text{Dream outcome} \times \text{Perceived likelihood}}{\text{Time delay} \times \text{Effort \& sacrifice}}
\]

| Lever | Evidence-backed move | Our product |
|-------|----------------------|-------------|
| ↑ Dream outcome | Name the identity result, not features | “Clear, confident voice for speaking & singing” — not “export JSON” |
| ↑ Likelihood | Proof, demos, progressive wins | Pitch highway feedback, holds logged, session scores, 12-week plan |
| ↓ Time delay | Aha in first session | Empezar → mic + sound + lanes in &lt;30s |
| ↓ Effort | Defaults that reduce cognitive load | **1-nota default**, Auto piano, range auto-shift, UI tours |

**Implication:** Price Pro as *coach tooling + proof of progress*, never as *permission to practice*. Core practice free raises likelihood and lowers effort.

### 1.2 Freemium & trial economics

| Finding | Typical range | Application |
|---------|---------------|-------------|
| Freemium → paid | **~2–5%** (often) | Don’t panic; optimize quality of converters |
| Trial → paid (opt-in) | Higher when value is felt | Our **7-day reverse-ish trial** (Pro tools open early) is right-shaped |
| Time-to-value | Sub-5 min wins signups | Keep free path fully usable day 1 |
| Hybrid freemium | Feature + usage ceilings beat pure feature gates | Soft gate **export / multi-profile / insights**, never Empezar |
| Best upgrade trigger | “I’ve outgrown free” after success | Milestone prompts after sessions/holds/plan check-ins |

Reddit / forum pattern (r/singing, r/yousician): users **reject** apps that paywall singing time; they **accept** pay for unlimited songs/library, serious feedback, or coaching paths — and they **anchor** price to private lessons (~\$30–150/session). Annual plans framed as “&lt; one lesson” convert better.

### 1.3 Psychology & neuroscience (ethical use)

| Principle | Do | Don’t |
|-----------|----|-------|
| **Competence** (SDT) | Show accuracy, hold PRs, streak of practice days | Fake metrics or opaque scores |
| **Autonomy** | Free forever core; cancel anytime; skip tours | Dark patterns, hostage files |
| **Relatedness** | Coach language, dual ES/EN, plan “one focus” | Empty social feed for vanity |
| **Variable reward** | Pitch quality flashes, combo | Loot-box paywalls |
| **Sunk cost (positive)** | Surface minutes & sessions as *investment to protect* via export | Guilt-trip “you’ll lose everything” |
| **Loss aversion** | Trial countdown transparent | Fake scarcity timers |
| **Progressive disclosure** | UI tours per layout family | 20-step onboarding before first note |

Gaming literature is clear: dopamine loops **work** for retention but raise ethics flags when monetization exploits compulsion. Our stance: **game-like feedback for skill**, not for spend. Monetize *proof, portability, multi-learner, coach insights*.

### 1.4 Competitor lessons (Yousician, Sing Sharp, free tuners)

| Competitor pattern | User sentiment | Our differentiation |
|--------------------|----------------|---------------------|
| Time-capped free practice | Frustration | **Unlimited free practice** |
| Song library paywall | OK if core free | We don’t sell songs; we sell **skill system** |
| Pitch only, no speech | Incomplete for “voice” | **Vocal oratory + singing** dual track |
| Opaque “AI coach” | Skepticism | Transparent highway + cents + holds |
| \$10–20/mo | “vs lesson” debate | **\$9.99 / \$79 yr** + lesson anchor in UI |

---

## 2. Feature & section validation (client value)

### 2.1 What already delivers “aha” (protect)

| Asset | Value type | Verdict |
|-------|------------|---------|
| Pitch highway + dual labels | Competence, low effort | **Core free forever** |
| Piano / 1-nota / arpeggio / chords | Likelihood of hit | Default **1-nota** ✅ |
| Range auto octave | ↓ effort / strain | Strong differentiator — **keep free** |
| Mic sensitivity + hold grace | ↓ friction | Keep free |
| 36 exercise modes | Dream breadth | Free catalog = trust |
| 12-week plan | Structure, likelihood | Free; Pro adds **export/insights** |
| Local record + metrics | Autonomy / privacy | Free; Pro **export pack** |
| UI tours (home + per layout) | ↓ effort | Free |
| Stripe + Mercado Pago rails | LATAM conversion | Keep dual rail |

### 2.2 Gaps (where subscription value was weak)

1. **Pro benefits sounded like file features**, not dream outcomes.  
2. **No living “proof board”** of user progress on home (competence invisible).  
3. **No personalization in pricing** (“you already practiced X”).  
4. **No ethical milestone upgrade moments** after success.  
5. **No lesson-price anchor** in the offer.  
6. **Trial ending** was easy to miss.  
7. **Pro insights** named but not visibly *delivered* as a weekly narrative.

### 2.3 Exercise library (value audit principle)

| Type | User job-to-be-done | Keep free? | Monetization fit |
|------|---------------------|------------|------------------|
| Speech foundations (diction, volume, pause…) | Work / presence | Yes | Soft: export speech metrics pack |
| SOVT / sirens / holds | Warm-up health | Yes | Never paywall health tools |
| Pitch / solfège / scales | Musical skill | Yes | Highway is the product |
| 12-week focus | Habit system | Yes | Pro: coach export + multi-profile |

**Rule:** If blocking a feature would make someone *stop practicing safely*, it stays free.

---

## 3. Offer packaging (Grand Slam shape)

### Free forever (distribution + habit)

- All exercises, highway, piano, range shift, holds, plan, local history  
- 7-day Pro trial (local entitlement)  
- Value pulse (sessions, minutes, streak, best hold)  

### Pro Monthly (\$9.99 / S/35 / €9.99)

- Everything Free  
- **Export progress pack** (JSON + human summary)  
- **Multi-profile** practice slots (family / coach / “character” voices)  
- **Pro Insights** — auto narrative from your metrics  
- Soft: “coach dashboard” feel without blocking practice  

### Pro Yearly (\$79 / S/279) — **hero plan**

- ~20% savings  
- Anchored as **&lt; 1 private lesson**  
- Best LTV plan (push in UI)  

### Guarantees / risk reverse (copy, not legal warranty unless formalized)

- “Core practice always free”  
- “Cancel in Stripe / Mercado Pago anytime”  
- Trial: full Pro tools for 7 days  

---

## 4. Funnel & journey (product-led)

```
Land → Tour (optional) → First Empezar (aha < 2 min)
  → Value pulse updates (competence)
  → Habit: Continue / structured path / 12-week
  → Milestone (3 sessions | hold PR | plan check-in | trial D-2)
       → Soft Pro prompt (export / insights) — never block Empezar
  → Pricing modal (personal stats + lesson anchor + yearly hero)
  → Checkout rail (Stripe | Mercado Pago)
  → Return activate → Pro Insights visible
```

---

## 5. Implementation map (this release)

| Deliverable | File(s) |
|-------------|---------|
| Research doc | `docs/14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md` |
| Value metrics aggregator | `js/value-pulse.js` |
| Home Studio Pulse + Pro Insights | `index.html`, `app.js`, `styles.css`, `i18n.js` |
| Pricing value stack | `renderPricingModal`, billing-config features |
| Milestone soft prompts | `app.js` after save session / trial |
| Richer export | `billing.js` + value pulse |

---

## 6. Metrics to watch (ops)

| Metric | Why |
|--------|-----|
| Time to first Empezar | TTV |
| Sessions / week (free) | Habit |
| Trial → paid % | Offer quality |
| Yearly attach % | LTV |
| Export clicks (Pro) | Feature validation |
| Soft-prompt → pricing open rate | Message fit |
| Region × rail (PE MP vs Stripe) | GTM |

---

## 7. Ethics statement

We use game-inspired **feedback** for skill (highway quality, combos, holds). We **do not** use pay-to-win, loot-like randomness for progress, or fake countdown scarcity. Monetization is for **portability, multi-learner, and coach-grade insights** after value is proven.
