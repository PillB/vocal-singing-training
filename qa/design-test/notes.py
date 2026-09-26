#!/usr/bin/env python3
"""Write the judges' notes per question, with design numbers mapped back to arms.

Usage:  python3 qa/design-test/notes.py <judge results> [more results...] [--only key,key]

Reads   $DT_WORK/manifest.json (blind.mjs), $DT_WORK/verdicts.json (decide.py)
Writes  $DT_WORK/notes/<key>.md
"""
from __future__ import annotations

import argparse
import json
import os
import re

from common import WORK, load_manifest, load_results

ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
ap.add_argument("results", nargs="+", help="judge results, as for decide.py")
ap.add_argument("--only", help="comma-separated question keys")
opts = ap.parse_args()

man = load_manifest()
vpath = os.path.join(WORK, "verdicts.json")
ver = json.load(open(vpath, encoding="utf8")) if os.path.exists(vpath) else {}
res = load_results(opts.results, man)
only = opts.only.split(",") if opts.only else None


def sub(t, arm_of):
    return re.sub(r"(Diseño|Design) (\d)", lambda m: f"[arm {arm_of.get(int(m.group(2)), '?')}]", t)


os.makedirs(os.path.join(WORK, "notes"), exist_ok=True)
written = 0
for key, q in man.items():
    if only and key not in only:
        continue
    rs = sorted([r for r in res if r["key"] == key], key=lambda r: r["j"])
    if not rs:
        continue
    v = ver.get(key, {})
    names = ", ".join(f"{a} = {q['names'][a]}" for a in q["arms"])
    out = [f"# Judges' notes: {q['title']}", "", f"Verdict: {v.get('verdict')}. Arms: {names}", ""]
    for r in rs:
        order = q["judges"][r["j"]]["order"]
        arm_of = {i + 1: a for i, a in enumerate(order)}
        x = r["result"]
        rk = " > ".join(arm_of[n] for n in x["ranking"])
        out += [f"## {r['persona']} (ranked {rk}, confidence {x.get('confidence')})", sub(x.get("summary", ""), arm_of)]
        for s in x.get("scores", []):
            out.append(f"- arm {arm_of.get(s['design'], '?')} scored {s['score']}: {sub(s.get('why', ''), arm_of)}")
        for b in x.get("broken", []):
            out.append(f"- PROBLEM in arm {arm_of.get(b['design'], '?')}{' (blocking)' if b.get('blocking') else ''}: {sub(b['problem'], arm_of)}")
        out.append("")
    with open(os.path.join(WORK, "notes", f"{key}.md"), "w", encoding="utf8") as f:
        f.write("\n".join(out))
    written += 1
print(f"{written} notes written to {os.path.join(WORK, 'notes')}")
