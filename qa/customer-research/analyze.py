"""Score the panel's answers with SSR and apply the pre-registered rules.

Run: python qa/customer-research/analyze.py data/r1-responses.json data/r1-results.json

Pre-registered (README, written before any answer was scored):
- Primary rating = the pmf averaged over the three embedding models and the
  six anchor sets of the answer's language and question. Each model alone is
  a robustness check.
- Validity gates, all required before any concept is called better:
  V1 the bad offer (N) rates below today (C0) on trial and paid intent;
  V2 half price (P) rates above today on paid intent;
  V3 split-half reliability of the concept means >= 0.7 (Spearman-Brown);
  V4 holdout rank correlation >= 0.6 (tested in test_ssr.py).
- A framing beats today only if the paired 95% bootstrap interval of its
  difference from C0 is above 0 AND its difference from the placebo rewrite
  C0p is above 0 too. Beating C0 alone could be the reward for any rewrite.
- Segment results (18-34, 50+) are reported with their intervals and called
  hypotheses: n is 26 and 28.
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ssr  # noqa: E402

MODELS = ("mpnet", "minilm", "e5")
QUESTIONS = ("trial", "paid")
B = 4000  # bootstrap resamples
rng = np.random.default_rng(20261121)


def segment(age_band):
    return {"18-24": "18-34", "25-34": "18-34", "35-49": "35-49"}.get(age_band, "50+")


def score(responses, anchors):
    """Adds r[q]['pmf'][model] and r[q]['ens'] for each response and question."""
    for q in QUESTIONS:
        for lang in ("es", "en"):
            idx = [i for i, r in enumerate(responses) if r["lang"] == lang]
            texts = [responses[i][q] for i in idx]
            if not texts:
                continue
            per_model = {}
            for m in MODELS:
                per_model[m] = [x.pmf for x in ssr.Scorer(anchors[q][lang], model=m).rate_many(texts)]
            for k, i in enumerate(idx):
                pm = {m: per_model[m][k].tolist() for m in MODELS}
                responses[i].setdefault("ssr", {})[q] = {"pmf": pm, "ens": np.mean([per_model[m][k] for m in MODELS], axis=0).tolist()}
    return responses


def mean_of(pmf):
    return float(np.dot(pmf, np.arange(1, 6)))


def table(responses, people, q, model=None):
    """{concept: {person_id: mean rating}} for one question (ensemble or one model)."""
    t = {}
    for r in responses:
        p = r["ssr"][q]["ens"] if model is None else r["ssr"][q]["pmf"][model]
        t.setdefault(r["concept"], {})[r["id"]] = mean_of(p)
    return t


def paired_diff(t, a, b, ids):
    ids = [i for i in ids if i in t.get(a, {}) and i in t.get(b, {})]
    d = np.array([t[a][i] - t[b][i] for i in ids])
    if len(d) == 0:
        return None
    boots = rng.choice(d, size=(B, len(d)), replace=True).mean(axis=1)
    lo, hi = np.percentile(boots, [2.5, 97.5])
    return {"n": len(d), "diff": float(d.mean()), "lo": float(lo), "hi": float(hi)}


def ci_mean(vals):
    vals = np.array(vals)
    boots = rng.choice(vals, size=(B, len(vals)), replace=True).mean(axis=1)
    lo, hi = np.percentile(boots, [2.5, 97.5])
    return {"n": len(vals), "mean": float(vals.mean()), "lo": float(lo), "hi": float(hi)}


def split_half(t, ids, reps=500):
    """Correlation of concept means between random halves of the panel, Spearman-Brown corrected."""
    concepts = sorted(t)
    rs = []
    ids = list(ids)
    for _ in range(reps):
        perm = rng.permutation(ids)
        h1, h2 = perm[: len(ids) // 2], perm[len(ids) // 2:]
        m1 = [np.mean([t[c][i] for i in h1 if i in t[c]]) for c in concepts]
        m2 = [np.mean([t[c][i] for i in h2 if i in t[c]]) for c in concepts]
        r = np.corrcoef(m1, m2)[0, 1]
        rs.append(2 * r / (1 + r))
    return float(np.mean(rs))


def ranks(t):
    order = sorted(t, key=lambda c: -np.mean(list(t[c].values())))
    return {c: k + 1 for k, c in enumerate(order)}


def analyse(responses, people):
    by_id = {p["id"]: p for p in people}
    segs = {"all": [p["id"] for p in people]}
    for p in people:
        segs.setdefault(segment(p["age_band"]), []).append(p["id"])
    for lang in ("es", "en"):
        segs[lang] = [p["id"] for p in people if p["language"] == lang]
    out = {"segments": {k: len(v) for k, v in segs.items()}, "questions": {}}
    for q in QUESTIONS:
        t = table(responses, people, q)
        concepts = sorted(t)
        res = {"by_concept": {}, "vs_today": {}, "vs_placebo": {}, "robustness": {}}
        for seg, ids in segs.items():
            res["by_concept"][seg] = {c: ci_mean([t[c][i] for i in ids if i in t[c]]) for c in concepts}
            res["vs_today"][seg] = {c: paired_diff(t, c, "C0", ids) for c in concepts if c != "C0"}
            if "C0p" in t:
                res["vs_placebo"][seg] = {c: paired_diff(t, c, "C0p", ids) for c in concepts if c not in ("C0p",)}
        res["split_half"] = split_half(t, segs["all"])
        res["robustness"]["rank_ensemble"] = ranks(t)
        for m in MODELS:
            res["robustness"][f"rank_{m}"] = ranks(table(responses, people, q, m))
        out["questions"][q] = res
    out["gates"] = gates(out)
    out["verdicts"] = verdicts(out)
    _ = by_id
    return out


def gates(out):
    g = {}
    tr, pd = out["questions"]["trial"], out["questions"]["paid"]
    if "N" in tr["vs_today"]["all"]:
        g["V1_bad_offer_lower"] = all(out["questions"][q]["vs_today"]["all"]["N"]["hi"] < 0 for q in QUESTIONS)
    if "P" in pd["vs_today"]["all"]:
        g["V2_half_price_higher_paid"] = pd["vs_today"]["all"]["P"]["lo"] > 0
    g["V3_split_half_trial"] = tr["split_half"] >= 0.7
    g["V3_split_half_paid"] = pd["split_half"] >= 0.7
    return g


def verdicts(out):
    v = {}
    for q in QUESTIONS:
        res = out["questions"][q]
        for seg in res["vs_today"]:
            for c, d in res["vs_today"][seg].items():
                if c in ("N", "P", "C0p") or d is None:
                    continue
                p = res["vs_placebo"].get(seg, {}).get(c)
                beats = d["lo"] > 0 and (p is not None and p["lo"] > 0)
                worse = d["hi"] < 0
                v.setdefault(q, {}).setdefault(seg, {})[c] = "beats today and placebo" if beats else (
                    "worse than today" if worse else "no evidence of a difference")
    return v


if __name__ == "__main__":
    resp_path, out_path = HERE / sys.argv[1], HERE / sys.argv[2]
    responses = json.loads(resp_path.read_text())
    people = json.loads((HERE / "data" / "panel.json").read_text())["people"]
    anchors = json.loads((HERE / "data" / "anchors.json").read_text())
    by_id = {p["id"]: p for p in people}
    for r in responses:
        r["age_band"] = by_id[r["id"]]["age_band"]
    scored_path = resp_path.with_name(resp_path.stem + "-scored.json")
    if scored_path.exists() and "--rescore" not in sys.argv:
        responses = json.loads(scored_path.read_text())
    else:
        responses = score(responses, anchors)
        scored_path.write_text(json.dumps(responses, ensure_ascii=False))
    result = analyse(responses, people)
    out_path.write_text(json.dumps(result, indent=1))
    print(json.dumps(result["gates"], indent=1))
    for q in QUESTIONS:
        print(q, {c: round(x["mean"], 2) for c, x in result["questions"][q]["by_concept"]["all"].items()})
