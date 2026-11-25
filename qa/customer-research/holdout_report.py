"""Gate V4 in numbers: how well SSR recovers the blind holdout's labels.

Run: python qa/customer-research/holdout_report.py  (writes data/holdout-report.json)
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ssr  # noqa: E402

anchors = json.loads((HERE / "data/anchors.json").read_text())
items = json.loads((HERE / "data/holdout-labelled.json").read_text())["items"]
rep = {}
for q in ("trial", "paid"):
    for lang in ("es", "en"):
        its = [i for i in items if i["question"] == q and i["lang"] == lang]
        want = np.array([i["label"] for i in its], float)
        pm = {}
        for m in ssr.MODELS:
            pm[m] = np.array([r.pmf for r in ssr.Scorer(anchors[q][lang], model=m).rate_many([i["text"] for i in its])])
        pm["ensemble"] = np.mean([pm[m] for m in ssr.MODELS], axis=0)
        for m, p in pm.items():
            got = p @ np.arange(1, 6)
            rep[f"{q}/{lang}/{m}"] = {
                "spearman": round(float(spearmanr(got, want).statistic), 3),
                "mean_by_label": [round(float(got[want == k].mean()), 2) for k in range(1, 6)],
            }
(HERE / "data/holdout-report.json").write_text(json.dumps(rep, indent=1))
for k, v in rep.items():
    print(k, v)
