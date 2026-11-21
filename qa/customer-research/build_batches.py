"""Build the prompts' inputs: one batch = one concept shown to up to 8 people.

Run: python qa/customer-research/build_batches.py data/concepts-r1.json data/r1-batches.json

Batches never mix concepts (monadic) and never mix languages (one card per
batch). People are shuffled per concept with a fixed seed so that nobody is
always answered first. Prices follow the person's country: soles in Peru,
euros in Spain, pounds in the UK, dollars elsewhere (the international card
rail charges dollars).
"""
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def currency(location):
    if "Peru" in location:
        return "PEN"
    if "España" in location:
        return "EUR"
    if "UK" in location:
        return "GBP"
    return "USD"


def card(concept, lang):
    c = concept[lang]
    lines = [c["kicker"].upper(), c["headline"], c["sub"], ""] + [f"• {b}" for b in c["bullets"]]
    return "\n".join(lines)


def facts_for(spec, cid, lang, person):
    concept = spec["concepts"][cid]
    if "facts_override" in concept:
        return concept["facts_override"][lang]
    key = currency(person["location"]) + concept.get("price_key_suffix", "")
    return spec["facts"][lang].replace("{price}", spec["prices"][key][lang])


def build(spec, people, size=8, seed=0):
    batches = []
    for cid, concept in spec["concepts"].items():
        shown = spec["concepts"][concept.get("copy_of", cid)]
        rng = random.Random(f"{seed}-{cid}")
        for lang in ("es", "en"):
            group = [p for p in people if p["language"] == lang]
            rng.shuffle(group)
            n_batches = -(-len(group) // size)
            for b in range(n_batches):
                members = group[b::n_batches]
                batches.append({
                    "batch_id": f"{cid}-{lang}-{b}", "concept": cid, "lang": lang,
                    "card": card(shown, lang),
                    "people": [dict(p, price_and_terms=facts_for(spec, cid, lang, p)) for p in members],
                })
    return batches


if __name__ == "__main__":
    spec_path, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    spec = json.loads((HERE / spec_path).read_text() if not spec_path.is_absolute() else spec_path.read_text())
    people = json.loads((HERE / "data" / "panel.json").read_text())["people"]
    only = sys.argv[4].split(",") if len(sys.argv) > 4 else None
    batches = [b for b in build(spec, people, seed=seed) if not only or b["concept"] in only]
    target = out_path if out_path.is_absolute() else HERE / out_path
    target.write_text(json.dumps(batches, ensure_ascii=False, indent=1))
    print(len(batches), "batches,", sum(len(b["people"]) for b in batches), "answers")
