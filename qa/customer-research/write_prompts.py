"""Write one prompt file per batch (the exact text each synthetic panel agent reads).

Run: python qa/customer-research/write_prompts.py data/r1-batches.json prompts/r1 [--no-persona]

The prompt follows the paper's set-up (appendix A.4): the model impersonates a
respondent with given attributes in a survey, sees the concept, and replies
briefly in free text. We ask four questions instead of one: trial intent and
paid intent (both rated by SSR), what would put them off, and what they think
the site is (a comprehension check). --no-persona writes the paper's ablation:
the same concept and questions with no attributes at all.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

Q = {
    "es": ["P1. Según lo que acabas de leer, ¿qué tan probable es que pruebes este sitio web?",
           "P2. Imagina que lo usaste gratis una semana. ¿Qué tan probable es que pagues por Pro?",
           "P3. ¿Qué te haría dudar o te echaría para atrás, si hay algo?",
           "P4. En una frase: ¿qué es este sitio y para quién es?"],
    "en": ["Q1. Based on what you just read, how likely are you to try this website?",
           "Q2. Imagine you used it free for a week. How likely are you to pay for Pro?",
           "Q3. What, if anything, would make you hesitate or put you off?",
           "Q4. In one sentence: what is this website, and who is it for?"],
}


def person(p, persona=True):
    if not persona:
        return f"- Respondent {p['id']}: a survey respondent. What Pro would cost and the terms: {p['price_and_terms']}"
    return (f"- Respondent {p['id']}: {p['age']}-year-old {p['gender']}, lives in {p['location']}. "
            f"Money: \"{p['budget']}\" Occupation: {p['occupation']}. Would want to train: {p['wants_to_train']}. "
            f"Voice experience: {p['experience']}. Would use it on: {p['device']}. "
            f"What Pro would cost this person and the terms: {p['price_and_terms']}")


def prompt(b, persona=True):
    lang = "Spanish (the respondent's own variety of Spanish)" if b["lang"] == "es" else "English"
    who = ("become that person: their age, gender, where they live, their money situation, their occupation, "
           "what they would want to train, their experience, and the device they would use"
           if persona else "answer as that respondent")
    ids = ", ".join(p["id"] for p in b["people"])
    return f"""You are taking part in a consumer research survey, playing several different respondents, one after another.

For each respondent listed below, {who}. Each respondent has just been shown the same short description of a website (below), plus the price and terms that apply to them. Each one answers four questions in their own words, in {lang}, briefly (one to three sentences per question), the way that person would really answer, in their own voice. Answer each respondent independently: they do not know about each other. Do not compare respondents, summarise, or add commentary.

THE DESCRIPTION EVERY RESPONDENT SAW
\"\"\"
{b['card']}
\"\"\"

RESPONDENTS
{chr(10).join(person(p, persona) for p in b['people'])}

QUESTIONS (each respondent answers all four)
{chr(10).join(Q[b['lang']])}

Return one entry per respondent, with the respondent id exactly as given ({ids}).
"""


if __name__ == "__main__":
    batches = json.loads((HERE / sys.argv[1]).read_text())
    out = HERE / sys.argv[2]
    out.mkdir(parents=True, exist_ok=True)
    persona = "--no-persona" not in sys.argv
    index = []
    for b in batches:
        (out / f"{b['batch_id']}.txt").write_text(prompt(b, persona))
        index.append({"batch_id": b["batch_id"], "concept": b["concept"], "lang": b["lang"],
                      "ids": [p["id"] for p in b["people"]], "path": str(out / f"{b['batch_id']}.txt")})
    (out / "index.json").write_text(json.dumps(index, indent=1))
    print(len(index), "prompts in", out)
