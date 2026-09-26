"""Shared by briefs.py, decide.py and notes.py: the work folder, the manifest
blind.mjs wrote, and the judges' results."""
from __future__ import annotations

import json
import os
import sys
import tempfile

# Every output lives under one work folder, outside the repo by default.
WORK = os.environ.get("DT_WORK") or os.path.join(tempfile.gettempdir(), "design-test")
# Paths on the command line are relative to where the command was typed
# (npm run changes the working directory to the repo root).
CWD = os.environ.get("INIT_CWD") or os.getcwd()

# The judge for position j of every question (see judge-brief.md).
PERSONAS = ["beginner", "designer", "access"]


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(2)


def load_manifest() -> dict:
    path = os.path.join(WORK, "manifest.json")
    if not os.path.exists(path):
        die(f"no manifest at {path}: run blind.mjs first (and use the same DT_WORK)")
    with open(path, encoding="utf8") as f:
        return json.load(f)


def load_results(paths: list[str], man: dict) -> list[dict]:
    """Judge results from one or more files.

    A file is JSON ({"results": [...]} or a bare list) or JSON Lines. Each
    result is {"key", "j", "persona", "result": {ranking, scores, broken,
    confidence, summary}}. A JSON Lines file may also hold workflow journal
    lines ({"type": "result", "result": {"results": [...]}}), as the rounds'
    judging runs wrote them.
    """
    out: list[dict] = []

    def take(d) -> None:
        if isinstance(d, list):
            for x in d:
                take(x)
        elif isinstance(d, dict):
            if d.get("type") == "result" and "result" in d:
                take(d["result"])
            elif "results" in d:
                take(d["results"])
            elif "key" in d:
                out.append(d)

    for p in paths:
        with open(os.path.join(CWD, p), encoding="utf8") as f:
            text = f.read()
        try:
            take(json.loads(text))
        except json.JSONDecodeError:
            for line in text.splitlines():
                if line.strip():
                    take(json.loads(line))

    kept = []
    for r in out:
        if not r.get("result"):
            continue  # a judge that returned nothing
        key, j = r.get("key"), r.get("j")
        q = man.get(key)
        where = f"result for {key!r} judge {j!r}"
        if q is None:
            die(f"{where}: question not in the manifest")
        if not isinstance(j, int) or not 0 <= j < len(q["judges"]):
            die(f"{where}: j must be 0, 1 or 2")
        n = len(q["judges"][j]["order"])
        if sorted(r["result"].get("ranking", [])) != list(range(1, n + 1)):
            die(f"{where}: ranking must list designs 1..{n} exactly once")
        r.setdefault("persona", PERSONAS[j])
        kept.append(r)
    return kept
