"""The synthetic panel: 64 respondent profiles, the same 64 for every concept.

Run: python qa/customer-research/panel.py  (writes data/panel.json; deterministic)

Design choices, each a trade-off (README, "Panel"):
- Matched panel: every concept is rated by the same 64 profiles, each in a
  separate prompt, so a difference between concepts is not a difference in
  who was asked. Monadic: a profile never sees two concepts at once.
- Oversampled ends: 26 of 64 are 18-34 and 28 of 64 are 50+, because the
  owner asked for young adults and older people. Totals are therefore not an
  estimate of any real market; read results by age band.
- Attributes are the paper's (age, gender, income, location) plus three
  screener facts a real concept test would ask (what they want to train,
  experience, the device they would use) and occupation. Nothing
  psychographic ("loves music", "is shy"): that would write the answer into
  the persona.
- Income is a budget statement, as in the paper, not a currency amount, so it
  reads the same in Lima and in Leeds.
"""
import json
import random
from pathlib import Path

SEED = 20261121
OUT = Path(__file__).resolve().parent / "data" / "panel.json"

AGE_BANDS = [("18-24", 18, 24, 13), ("25-34", 25, 34, 13), ("35-49", 35, 49, 10),
             ("50-64", 50, 64, 13), ("65-80", 65, 80, 15)]

# Market one is Peru; then the rest of Latin America, Spain, US Hispanics, and
# English speakers. Weights are a sampling design, not a market estimate.
LOCALES = [
    ("Lima, Peru", "es", 0.26), ("Arequipa, Peru", "es", 0.06), ("Trujillo, Peru", "es", 0.04),
    ("Ciudad de México, México", "es", 0.07), ("Bogotá, Colombia", "es", 0.05),
    ("Buenos Aires, Argentina", "es", 0.04), ("Santiago, Chile", "es", 0.03),
    ("Madrid, España", "es", 0.06), ("Sevilla, España", "es", 0.03),
    ("Los Angeles, USA (Mexican-American, prefers Spanish)", "es", 0.04),
    ("Chicago, USA", "en", 0.08), ("Manchester, UK", "en", 0.06), ("Toronto, Canada", "en", 0.04),
    ("Sydney, Australia", "en", 0.03), ("Bangalore, India", "en", 0.04), ("Lagos, Nigeria", "en", 0.03),
]

INCOME = {
    "es": ["El dinero no me alcanza ni para lo básico.",
           "Cubro lo básico, pero no me sobra nada para extras.",
           "Cubro lo básico y a veces me doy un gusto pequeño.",
           "Vivo cómodo y puedo gastar en mis aficiones.",
           "El dinero no es un problema para mis aficiones."],
    "en": ["Money doesn't stretch to the basics.",
           "I cover the basics but there's nothing left for extras.",
           "I cover the basics and can sometimes afford a small treat.",
           "I'm comfortable and can spend on hobbies.",
           "Money isn't a concern when it comes to hobbies."],
}
# Budget level weights by country group (1..5). Peru and much of LatAm skew
# lower; the weights are a design assumption, recorded, not a statistic.
INCOME_W = {"latam": [0.12, 0.30, 0.33, 0.18, 0.07], "rich": [0.05, 0.17, 0.33, 0.30, 0.15],
            "india_nigeria": [0.10, 0.28, 0.32, 0.20, 0.10]}

INTEREST = [("singing", 0.45), ("speaking", 0.25), ("both", 0.30)]
EXPERIENCE = [("none: has never trained their voice", 0.35),
              ("sings casually (at home, karaoke, at church or with family)", 0.35),
              ("has sung in a choir or a band", 0.15),
              ("has taken a few voice or singing lessons", 0.15)]


def occupation(age, rng):
    if age <= 22:
        return rng.choice(["university student", "university student", "works part-time and studies", "works full-time"])
    if age <= 34:
        return rng.choice(["office job", "works in sales or customer service", "self-employed", "teacher",
                           "postgraduate student", "looking for work"])
    if age <= 49:
        return rng.choice(["office job", "manager", "self-employed", "teacher", "nurse", "works in sales"])
    if age <= 64:
        return rng.choice(["office job", "self-employed", "teacher", "homemaker", "retired early", "small-business owner"])
    return rng.choice(["retired", "retired", "retired", "retired, volunteers at church", "still works part-time"])


def device(age, rng):
    if age >= 65:
        return rng.choices(["phone", "tablet", "laptop or desktop"], [0.55, 0.20, 0.25])[0]
    return rng.choices(["phone", "tablet", "laptop or desktop"], [0.68, 0.04, 0.28])[0]


def quota(rng, table, count):
    """Exactly-proportioned categories for one age band (largest remainder),
    shuffled: random draws of 13 people left one band with no speakers."""
    raw = [(t[0], t[-1] * count) for t in table]
    got = {k: int(v) for k, v in raw}
    for k, v in sorted(raw, key=lambda kv: kv[1] - int(kv[1]), reverse=True)[: count - sum(got.values())]:
        got[k] += 1
    out = [k for k, _ in raw for _ in range(got[k])]
    rng.shuffle(out)
    return out


def build():
    rng = random.Random(SEED)
    people = []
    n = 0
    for band, lo, hi, count in AGE_BANDS:
        interests = quota(rng, INTEREST, count)
        experiences = quota(rng, EXPERIENCE, count)
        genders = quota(rng, [("woman", 0.5), ("man", 0.5)], count)
        langs = quota(rng, [("es", 0.65), ("en", 0.35)], count)
        for i in range(count):
            n += 1
            pool = [loc for loc in LOCALES if loc[1] == langs[i]]
            where, lang, _w = rng.choices(pool, [loc[2] for loc in pool])[0]
            group = "latam" if (lang == "es" and "España" not in where) else (
                "india_nigeria" if ("India" in where or "Nigeria" in where) else "rich")
            level = rng.choices(range(1, 6), INCOME_W[group])[0]
            age = rng.randint(lo, hi)
            # One non-binary respondent per band would be 8% of the panel; a 2%
            # share rounds to none in a band of 13. Recorded as a limitation.
            gender = genders[i]
            people.append({
                "id": f"R{n:02d}", "age": age, "age_band": band, "gender": gender, "location": where,
                "language": lang, "budget_level": level, "budget": INCOME[lang][level - 1],
                "occupation": occupation(age, rng), "wants_to_train": interests[i],
                "experience": experiences[i], "device": device(age, rng),
            })
    return people


if __name__ == "__main__":
    OUT.parent.mkdir(exist_ok=True)
    people = build()
    OUT.write_text(json.dumps({"seed": SEED, "n": len(people), "people": people}, ensure_ascii=False, indent=1))
    from collections import Counter
    print(len(people), Counter(p["age_band"] for p in people), Counter(p["language"] for p in people),
          Counter(p["wants_to_train"] for p in people))
