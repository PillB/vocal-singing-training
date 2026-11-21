"""Gather the panel agents' answers from workflow journals into one file.

Run: python qa/customer-research/collect.py <out.json> <journal.jsonl> [<journal.jsonl> ...]

Each journal line "started" carries the agent's label (<tag>:<batch_id>), and
the matching "result" line carries its structured answer. Only answers whose
respondent id belongs to that batch are kept; a batch that came back short is
reported, not padded.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(journals):
    index = {}
    for f in HERE.glob("prompts/*/index.json"):
        for item in json.loads(f.read_text()):
            index.setdefault(item["batch_id"], item)
    labels, out, short = {}, [], []
    for j in journals:
        for line in Path(j).read_text().splitlines():
            o = json.loads(line)
            if o.get("type") == "started":
                labels[o["key"]] = o["label"]
            elif o.get("type") == "result" and o["key"] in labels:
                tag, batch_id = labels[o["key"]].split(":", 1)
                meta = index[batch_id]
                want = set(meta["ids"])
                answers = [a for a in (o.get("result") or {}).get("answers", []) if a.get("id") in want]
                if len(answers) < len(want):
                    short.append((batch_id, sorted(want - {a["id"] for a in answers})))
                for a in answers:
                    out.append({"run": tag, "batch_id": batch_id, "concept": meta["concept"], "lang": meta["lang"], **a})
    return out, short


if __name__ == "__main__":
    rows, short = load(sys.argv[2:])
    # one answer per (concept, respondent): a batch re-run replaces, never doubles
    seen = {}
    for r in rows:
        seen[(r["concept"], r["id"])] = r
    rows = sorted(seen.values(), key=lambda r: (r["concept"], r["id"]))
    target = Path(sys.argv[1])
    target = target if target.is_absolute() else HERE / target
    target.write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    from collections import Counter
    print(len(rows), "answers", dict(Counter(r["concept"] for r in rows)))
    if short:
        print("short batches:", short)
