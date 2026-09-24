#!/usr/bin/env python3
# Pre-registered decision rule for the blinded design test. Written before any
# judge result was read.
#
#   python3 qa/design-test/decide.py <judge results> [more results...]
#
# Per question and challenger X (today's design is arm A):
#   wins(X)   = judges who ranked X above A (of 3)
#   guard(X)  = any objective regression against A in any state/viewport:
#               - phones (phone, small, land): more controls under 44px in the first screen
#               - smallest text under 12px and smaller than A's
#               - more contrast failures
#               - horizontal overflow that A does not have
#               - more page errors
#               - a blocking problem reported by 2 or more judges
#   ship      : wins >= 2 and no guard. Several ship-able challengers: best mean
#               rank, then best mean score.
#   close     : wins == 1, or wins >= 2 with a guard (fix the guard if it is
#               mechanical and re-measure; otherwise it becomes a real A/B test)
#   holds     : wins == 0 for every challenger
#
# Reads $DT_WORK/manifest.json (blind.mjs) and the judges' results (format in
# common.load_results and judge-brief.md). Writes $DT_WORK/verdicts.json.
import argparse
import json
import os
from collections import defaultdict

from common import WORK, load_manifest, load_results

ap = argparse.ArgumentParser(description="Apply the pre-registered decision rule to the judges' results.")
ap.add_argument("results", nargs="+", help="judge results: JSON ({\"results\": [...]} or a list) or JSON Lines")
opts = ap.parse_args()

man = load_manifest()
PHONES = ("phone", "small", "land")

results = load_results(opts.results, man)

by_q = defaultdict(list)
for r in results:
    if r and r.get("result"):
        by_q[r["key"]].append(r)

def guard(q, x):
    out = []
    ma, mx = q["metrics"]["A"], q["metrics"][x]
    for sv, a in ma.items():
        b = mx.get(sv)
        if not b:
            continue
        vp = sv.split("__")[1]
        if vp in PHONES and (b["controlsUnder44"] or 0) > (a["controlsUnder44"] or 0):
            out.append(f"{sv}: controls under 44px {a['controlsUnder44']} -> {b['controlsUnder44']}")
        if b["minFont"] is not None and b["minFont"] < 11.95 and (a["minFont"] is None or b["minFont"] < a["minFont"] - 0.05):
            out.append(f"{sv}: smallest text {a['minFont']} -> {b['minFont']}px")
        if (b["contrastFails"] or 0) > (a["contrastFails"] or 0):
            out.append(f"{sv}: contrast failures {a['contrastFails']} -> {b['contrastFails']}")
        if b["overflowX"] and not a["overflowX"]:
            out.append(f"{sv}: horizontal overflow")
        if (b["errors"] or 0) > (a["errors"] or 0):
            out.append(f"{sv}: page errors {a['errors']} -> {b['errors']}")
    return out

report = {}
for key, q in man.items():
    js = sorted(by_q.get(key, []), key=lambda r: r["j"])
    if not js:
        continue
    arms = q["arms"]
    ranks = defaultdict(list)
    scores = defaultdict(list)
    blocking = defaultdict(list)
    notes = []
    for r in js:
        order = q["judges"][r["j"]]["order"]
        res = r["result"]
        arm_of = {i + 1: a for i, a in enumerate(order)}
        rk = [arm_of[n] for n in res["ranking"] if n in arm_of]
        for i, a in enumerate(rk):
            ranks[a].append(i + 1)
        for s in res.get("scores", []):
            if s["design"] in arm_of:
                scores[arm_of[s["design"]]].append(s["score"])
        for b in res.get("broken", []):
            if b.get("blocking") and b["design"] in arm_of:
                blocking[arm_of[b["design"]]].append((r["persona"], b["problem"]))
        summ = res.get("summary", "")
        for n, a in arm_of.items():
            summ = summ.replace(f"Diseño {n}", f"[{a}]").replace(f"Design {n}", f"[{a}]")
        notes.append({"persona": r["persona"], "ranking": rk, "confidence": res.get("confidence"), "summary": summ})
    per = {}
    for x in arms:
        if x == "A":
            continue
        wins = sum(1 for r in notes if r["ranking"].index(x) < r["ranking"].index("A"))
        g = guard(q, x)
        blk = blocking.get(x, [])
        if len({p for p, _ in blk}) >= 2:
            g.append("blocking problem reported by 2+ judges: " + "; ".join(p for _, p in blk))
        per[x] = {"name": q["names"].get(x), "wins": wins, "guard": g,
                  "meanRank": round(sum(ranks[x]) / len(ranks[x]), 2) if ranks[x] else None,
                  "meanScore": round(sum(scores[x]) / len(scores[x]), 2) if scores[x] else None}
    ship = [x for x, v in per.items() if v["wins"] >= 2 and not v["guard"]]
    ship.sort(key=lambda x: (per[x]["meanRank"], -(per[x]["meanScore"] or 0)))
    close = [x for x, v in per.items() if x not in ship and (v["wins"] == 1 or (v["wins"] >= 2 and v["guard"]))]
    verdict = "ship " + ship[0] if ship else ("close" if close else "holds")
    report[key] = {"title": q["title"], "verdict": verdict, "judges": len(js),
                   "A": {"meanRank": round(sum(ranks["A"]) / len(ranks["A"]), 2) if ranks["A"] else None,
                         "meanScore": round(sum(scores["A"]) / len(scores["A"]), 2) if scores["A"] else None,
                         "blocking": blocking.get("A", [])},
                   "challengers": per, "close": close, "notes": notes}

out = os.path.join(WORK, "verdicts.json")
with open(out, "w", encoding="utf8") as f:
    json.dump(report, f, indent=1, ensure_ascii=False)
for k, v in report.items():
    c = ", ".join(f"{x}({v['challengers'][x]['name']}): wins {v['challengers'][x]['wins']}/3 rank {v['challengers'][x]['meanRank']} score {v['challengers'][x]['meanScore']}{' GUARD' if v['challengers'][x]['guard'] else ''}" for x in v["challengers"])
    print(f"{k:14s} {v['verdict']:8s} A rank {v['A']['meanRank']} score {v['A']['meanScore']} | {c}")
print(f"Verdicts: {out}")
