#!/usr/bin/env python3
"""Write one brief per question and judge: what the screen must do, the
images to read, and behaviour notes per design number. No arm names, no key.

Usage:  python3 qa/design-test/briefs.py [key,key...]

Reads   $DT_WORK/manifest.json (blind.mjs)
Writes  $DT_WORK/blind/<key>/j<n>/brief.md, and $DT_WORK/judge-items.json:
        one {key, j, persona, brief} per judge, for whatever runs the judges
        (judge-brief.md says what each judge is told).
"""
from __future__ import annotations

import argparse
import json
import os

from common import PERSONAS, WORK, load_manifest

ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("keys", nargs="?", help="comma-separated question keys (default: every question in the manifest)")
opts = ap.parse_args()

man = load_manifest()
only = opts.keys.split(",") if opts.keys else None
items = []
for key, q in man.items():
    if only and key not in only:
        continue
    for j, jd in enumerate(q["judges"]):
        lines = [f"# {q['title']}", "", f"**What this screen must do:** {q['job']}", "",
                 f"There are {len(jd['order'])} designs, labelled Diseño 1 to Diseño {len(jd['order'])} in every image.", "",
                 "## Images (read every one, in this order)", ""]
        for im in jd["images"]:
            lines.append(f"- `{im['path']}` — {im['what']}")
        notes = [(i + 1, q["captions"].get(a, "")) for i, a in enumerate(jd["order"])]
        notes = [(n, c) for n, c in notes if c]
        if notes:
            lines += ["", "## What the screenshots cannot show (facts about behaviour)", ""]
            for n, c in notes:
                lines.append(f"- **Diseño {n}:** {c}")
        path = os.path.join(WORK, "blind", key, f"j{j}", "brief.md")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf8") as f:
            f.write("\n".join(lines) + "\n")
        items.append({"key": key, "j": j, "persona": PERSONAS[j], "brief": path})

with open(os.path.join(WORK, "judge-items.json"), "w", encoding="utf8") as f:
    json.dump(items, f, indent=1, ensure_ascii=False)
print(f"{len(items)} briefs written; list in {os.path.join(WORK, 'judge-items.json')}")
