"""Unblind round 1's blind coding and blind re-rating, and run the pre-registered rules on the re-rating.

Run: python qa/customer-research/blind_check.py [r1|r2]   (default r1)

Why: the plan (README, "Checks") called for a second way of reading the same
answers, because SSR compresses differences and round 1's paid-intent gates
failed (V1 and V3 on paid). Here other agents, who saw only the answer text in
batches that mixed all nine cards, gave each intent answer a 1-5 rating and
tagged each objection. This script joins their work to the key and applies the
same rules analyze.py applies to SSR, so the two readings can be compared.

Inputs, all committed, for round <r>: data/<r>-blind-key.json (blind id ->
card, language, respondent), data/<r>-blind-rated.json, data/<r>-blind-coded.json,
data/<r>-responses-scored.json (the SSR ratings), data/panel.json.
Output: data/<r>-blind-results.json.

What it cannot do: the raters are models too, so agreement between the two
readings is agreement between two machine readings of machine answers, not
evidence about people.
"""
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import analyze  # noqa: E402

DATA = HERE / "data"
FLAGS = ("says_singing", "says_speaking", "says_free", "says_browser_no_install",
         "says_visual_feedback", "says_short_daily")


def load_json(name):
    return json.loads((DATA / name).read_text())


def rated_tables(key, rated):
    """{question: {card: {respondent: 1-5 rating}}} from the blind ratings."""
    t = {q: {} for q in analyze.QUESTIONS}
    for blind_id, k in key.items():
        for q in analyze.QUESTIONS:
            t[q].setdefault(k["concept"], {})[k["id"]] = float(rated[blind_id][q])
    return t


def ranks_of(values):
    order = np.argsort(np.argsort(values, kind="stable"), kind="stable").astype(float)
    # average ties
    out = order.copy()
    for v in np.unique(values):
        idx = np.where(values == v)[0]
        out[idx] = order[idx].mean()
    return out


def agreement(flr, ssr):
    """Respondent-level and card-level agreement between the two readings, per question."""
    res = {}
    for q in analyze.QUESTIONS:
        pairs = [(flr[q][c][i], ssr[q][c][i]) for c in flr[q] for i in flr[q][c] if i in ssr[q].get(c, {})]
        a, b = np.array(pairs).T
        cards = sorted(flr[q])
        ma = np.array([np.mean(list(flr[q][c].values())) for c in cards])
        mb = np.array([np.mean(list(ssr[q][c].values())) for c in cards])
        res[q] = {
            "n": len(pairs),
            "pearson": float(np.corrcoef(a, b)[0, 1]),
            "spearman": float(np.corrcoef(ranks_of(a), ranks_of(b))[0, 1]),
            "card_means_pearson": float(np.corrcoef(ma, mb)[0, 1]),
            "spread_flr": float(ma.max() - ma.min()),
            "spread_ssr": float(mb.max() - mb.min()),
        }
    return res


def share(rows, test):
    return round(100 * sum(1 for r in rows if test(r)) / len(rows)) if rows else None


def codes(key, coded, people):
    """Objection tags by card and by age band, and what people said the product is, by card."""
    band = {p["id"]: p["age_band"] for p in people}
    rows = [dict(coded[b], concept=k["concept"], band=band[k["id"]]) for b, k in key.items()]
    tags = [t for t, _ in Counter(t for r in rows for t in r["hesitation"]).most_common()]
    cards = sorted({r["concept"] for r in rows})
    bands = sorted({r["band"] for r in rows})
    without_bad = [r for r in rows if r["concept"] != "N"]
    by_card = {c: [r for r in rows if r["concept"] == c] for c in cards}
    by_band = {b: [r for r in without_bad if r["band"] == b] for b in bands}
    return {
        "objections_by_card": {t: {c: share(by_card[c], lambda r, t=t: t in r["hesitation"]) for c in cards} for t in tags},
        "objections_by_age_band_without_bad_offer": {
            t: {b: share(by_band[b], lambda r, t=t: t in r["hesitation"]) for b in bands} for t in tags},
        "age_band_n": {b: len(v) for b, v in by_band.items()},
        "understood_by_card": {f: {c: share(by_card[c], lambda r, f=f: bool(r[f])) for c in cards} for f in FLAGS},
        "misreading_by_card": {c: share(by_card[c], lambda r: bool(r["misreading"])) for c in cards},
    }


def main(rnd="r1"):
    key = load_json(f"{rnd}-blind-key.json")["key"]
    rated = load_json(f"{rnd}-blind-rated.json")["rated"]
    coded = load_json(f"{rnd}-blind-coded.json")["coded"]
    people = load_json("panel.json")["people"]
    scored = load_json(f"{rnd}-responses-scored.json")
    flr = rated_tables(key, rated)
    ssr = {q: analyze.table(scored, people, q) for q in analyze.QUESTIONS}
    out = {"rating": analyze.analyse_tables(flr, people), "agreement_with_ssr": agreement(flr, ssr),
           "codes": codes(key, coded, people)}
    (DATA / f"{rnd}-blind-results.json").write_text(json.dumps(out, indent=1))
    print("gates on the blind rating:", json.dumps(out["rating"]["gates"]))
    print("agreement:", json.dumps(out["agreement_with_ssr"], indent=1))
    print("verdicts (all):", json.dumps({q: out["rating"]["verdicts"][q]["all"] for q in analyze.QUESTIONS}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "r1")
