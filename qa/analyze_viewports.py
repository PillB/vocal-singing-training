#!/usr/bin/env python3
"""
Explicit geometry checks for multi-viewport capture JSON.
Validates sticky highway + controls stay inside each viewport.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent / "geometry" / "viewports"


def main() -> int:
    summary_path = ROOT / "_summary.json"
    if not summary_path.exists():
        print("Missing", summary_path, "— run capture-viewports.mjs first")
        return 2
    data = json.loads(summary_path.read_text())
    print("=== Multi-viewport forensic analysis ===")
    print("Viewports:", len(data.get("viewports") or []))
    print("Total issues (capture):", data.get("totalIssues"))
    # Recompute explicit stage fit: stage.y2 <= vh + eps
    recompute = 0
    for vp in data.get("viewports") or []:
        pitch = (vp.get("scenes") or {}).get("pitch") or {}
        stage = pitch.get("stage") or {}
        vh = pitch.get("vh") or vp.get("height")
        vw = pitch.get("vw") or vp.get("width")
        if not stage or not stage.get("visible"):
            continue
        y2 = stage.get("y2", 0)
        x2 = stage.get("x2", 0)
        h = stage.get("h", 0)
        # Explicit math
        fits_v = y2 <= vh + 2.0
        fits_h = x2 <= vw + 2.0 and stage.get("x", 0) >= -2.0
        avail = vh - (stage.get("y") or 0)
        print(
            f"{vp['id']}: stage h={h:.0f} y2={y2:.0f} vh={vh} "
            f"fits_v={fits_v} fits_h={fits_h} avail={avail:.0f}"
        )
        if not fits_v or not fits_h:
            recompute += 1
            print(f"  FAIL: stage does not fit viewport")
        canvas = pitch.get("canvas")
        if canvas and canvas.get("visible"):
            if canvas.get("y2", 0) > vh + 2:
                recompute += 1
                print(f"  FAIL: canvas overflows vh")
            if canvas.get("h", 0) < 120:
                print(f"  WARN: canvas very short h={canvas.get('h'):.0f}")

    fails = list(data.get("failed") or [])
    print("\nCapture failures:", len(fails))
    for f in fails[:40]:
        print(" -", f)
    print("Recomputed fit failures:", recompute)
    critical = data.get("totalIssues", 0) + recompute
    print("Critical total:", critical)
    return 1 if critical > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
