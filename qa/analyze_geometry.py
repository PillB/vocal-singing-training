#!/usr/bin/env python3
"""
Forensic geometry analysis: explicit AABB overlap, overflow, z-order conflicts.
No layout libraries — pure rectangle math.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

GEO = Path(__file__).parent / "geometry"
EPS = 2.0  # px tolerance for rounding / hairline
MIN_AREA = 4.0  # ignore tiny intersections

# Peers that must not cover each other (interactive HUD)
PEER_SELECTORS = {
    ".hud-tl",
    ".hud-tr",
    ".hud-bl",
    ".hud-br",
    ".hud-bc",
    "#mic-sensitivity",
    "#btn-practice-start",
    "#btn-practice-stop",
    "#btn-back-home",
    "#btn-lang",
    "#btn-tour",
    "#btn-history",
    "#btn-plan",
    "#btn-pricing",
    "#btn-continue",
    "#btn-structured",
    "#btn-complete",
    "#btn-practice-start",
    "#pricing-close",
}


def area_intersection(a: dict, b: dict) -> float:
    ix1 = max(a["x"], b["x"])
    iy1 = max(a["y"], b["y"])
    ix2 = min(a["x2"], b["x2"])
    iy2 = min(a["y2"], b["y2"])
    w = ix2 - ix1
    h = iy2 - iy1
    if w <= EPS or h <= EPS:
        return 0.0
    return w * h


def is_ancestor_pair(a: dict, b: dict, items: list) -> bool:
    """Heuristic: same id prefix or one fully contains the other as nest."""
    # If A completely contains B and A is not a peer HUD corner, treat as nest
    def contains(outer, inner):
        return (
            outer["x"] <= inner["x"] + EPS
            and outer["y"] <= inner["y"] + EPS
            and outer["x2"] >= inner["x2"] - EPS
            and outer["y2"] >= inner["y2"] - EPS
            and (outer["w"] * outer["h"] > inner["w"] * inner["h"] + 1)
        )

    sa, sb = a.get("sel", ""), b.get("sel", "")
    hud = {".hud-tl", ".hud-tr", ".hud-bl", ".hud-br"}
    hud_kids = {
        "#btn-practice-start",
        "#btn-practice-stop",
        "#timer-display",
        "#hold-display",
        "#chord-now",
        "#pitch-game-hud",
        "#piano-mini-opts",
    }

    # Intentional: practice buttons / mini-opts live inside HUD corners
    if sa in hud and (sb in hud_kids or sb == "interactive") and contains(a, b):
        return True
    if sb in hud and (sa in hud_kids or sa == "interactive") and contains(b, a):
        return True
    # Nested interactive inside HUD with hairline bleed still counts as nest
    def soft_contains(outer, inner):
        return (
            outer["x"] <= inner["x"] + 8
            and outer["y"] <= inner["y"] + 8
            and outer["x2"] + 8 >= inner["x2"]
            and outer["y2"] + 10 >= inner["y2"]
            and outer["w"] * outer["h"] > inner["w"] * inner["h"] * 0.5
        )

    if sa in hud and sb == "interactive" and soft_contains(a, b):
        return True
    if sb in hud and sa == "interactive" and soft_contains(b, a):
        return True
    # Start/stop never overlap each other when one is hidden; if both boxes nest ignore
    if {sa, sb} == {"#btn-practice-start", "#btn-practice-stop"}:
        return True

    if contains(a, b) or contains(b, a):
        # Distinct HUD corners must not fully cover each other
        if sa in hud and sb in hud:
            return False
        # header containing buttons is fine
        if "header" in sa or "header" in sb:
            return True
        if sa in (".practice-cockpit", "#highway-stage", "#pitch-block", ".highway-stage") or sb in (
            ".practice-cockpit",
            "#highway-stage",
            "#pitch-block",
            ".highway-stage",
        ):
            return True
        if sa in ("#exercise-list", ".tabs", ".tier-filters", "#mode-hud", ".mode-shell") or sb in (
            "#exercise-list",
            ".tabs",
            ".tier-filters",
            "#mode-hud",
            ".mode-shell",
        ):
            return True
        if a.get("tag") in ("SECTION", "MAIN", "FORM") or b.get("tag") in (
            "SECTION",
            "MAIN",
            "FORM",
        ):
            return True
        # generic nest
        return True
    return False


def overflow(el: dict, vw: float, vh: float) -> list[str]:
    issues = []
    if not el.get("visible"):
        return issues
    # allow slight subpixel
    if el["x"] < -EPS:
        issues.append(f"left overflow x={el['x']:.1f}")
    if el["y"] < -EPS and el.get("position") != "sticky":
        # sticky header may be ok; still report large negative
        if el["y"] < -50:
            issues.append(f"top overflow y={el['y']:.1f}")
    if el["x2"] > vw + EPS:
        issues.append(f"right overflow x2={el['x2']:.1f}>{vw}")
    if el["y2"] > vh + EPS and el.get("position") not in ("sticky", "fixed"):
        # full-page content can extend below fold — only flag if FIXED/ABSOLUTE overlays go past
        if el.get("position") in ("absolute", "fixed"):
            issues.append(f"bottom overflow y2={el['y2']:.1f}>{vh} ({el.get('position')})")
    return issues


def analyze_file(path: Path) -> dict:
    data = json.loads(path.read_text())
    vw, vh = data["vw"], data["vh"]
    label = data.get("label") or path.stem
    items = [i for i in data["items"] if i.get("visible")]
    # dedupe by rounded box + sel
    uniq = {}
    for i in items:
        key = (i.get("sel"), round(i["x"]), round(i["y"]), round(i["w"]), round(i["h"]))
        uniq[key] = i
    items = list(uniq.values())

    overlaps = []
    for i, a in enumerate(items):
        for b in items[i + 1 :]:
            sa, sb = a.get("sel", ""), b.get("sel", "")
            # only care about peer interactive / HUD
            peer_a = sa in PEER_SELECTORS or sa == "interactive"
            peer_b = sb in PEER_SELECTORS or sb == "interactive"
            if not (peer_a and peer_b):
                continue
            if is_ancestor_pair(a, b, items):
                continue
            area = area_intersection(a, b)
            # Header chips: ignore hairline / wrap-row collisions in chrome
            headerish = (
                a.get("y", 0) < 90
                and b.get("y", 0) < 90
                and (
                    sa in PEER_SELECTORS
                    or sb in PEER_SELECTORS
                    or sa == "interactive"
                    or sb == "interactive"
                )
            )
            if headerish and area < 900:
                continue
            # Pricing modal capture: header under dim is non-interactive focus of page is modal
            if str(label).startswith("07_pricing") and headerish:
                continue
            if area > MIN_AREA:
                overlaps.append(
                    {
                        "a": sa,
                        "b": sb,
                        "area": round(area, 1),
                        "a_box": [round(a["x"], 1), round(a["y"], 1), round(a["w"], 1), round(a["h"], 1)],
                        "b_box": [round(b["x"], 1), round(b["y"], 1), round(b["w"], 1), round(b["h"], 1)],
                        "z": [a.get("z", 0), b.get("z", 0)],
                    }
                )

    overflows = []
    for el in items:
        sa = el.get("sel", "")
        if sa not in PEER_SELECTORS and el.get("position") not in ("absolute", "fixed", "sticky"):
            continue
        for msg in overflow(el, vw, vh):
            overflows.append({"sel": sa, "msg": msg, "box": [el["x"], el["y"], el["w"], el["h"]]})

    zero = [
        {"sel": i.get("sel"), "box": [i["x"], i["y"], i["w"], i["h"]]}
        for i in data["items"]
        if i.get("visible") is False
        and i.get("sel") in PEER_SELECTORS
        and i.get("w", 0) == 0
    ]

    # Fold / game-HUD: critical controls should sit in first viewport
    fold_issues = []
    fold_sels = {
        "#btn-practice-start",
        ".hud-tl",
        ".hud-bl",
        ".hud-br",
        ".hud-bc",
        "#highway-stage",
    }
    for el in items:
        sa = el.get("sel", "")
        if sa not in fold_sels or not el.get("visible"):
            continue
        # Center of control must be in viewport (game overlay principle)
        cy = el["y"] + el["h"] / 2
        cx = el["x"] + el["w"] / 2
        if cy > vh + EPS or cy < -EPS:
            fold_issues.append(
                {
                    "sel": sa,
                    "msg": f"center y={cy:.1f} outside viewport h={vh}",
                    "box": [el["x"], el["y"], el["w"], el["h"]],
                }
            )
        if cx > vw + EPS or cx < -EPS:
            fold_issues.append(
                {
                    "sel": sa,
                    "msg": f"center x={cx:.1f} outside viewport w={vw}",
                    "box": [el["x"], el["y"], el["w"], el["h"]],
                }
            )

    # Peer HUD corners must not overlap each other (explicit AABB)
    hud_corners = [i for i in items if i.get("sel") in {".hud-tl", ".hud-tr", ".hud-bl", ".hud-br", ".hud-bc"} and i.get("visible")]
    for i, a in enumerate(hud_corners):
        for b in hud_corners[i + 1 :]:
            area = area_intersection(a, b)
            if area > MIN_AREA:
                overlaps.append(
                    {
                        "a": a["sel"],
                        "b": b["sel"],
                        "area": round(area, 1),
                        "a_box": [round(a["x"], 1), round(a["y"], 1), round(a["w"], 1), round(a["h"], 1)],
                        "b_box": [round(b["x"], 1), round(b["y"], 1), round(b["w"], 1), round(b["h"], 1)],
                        "z": [a.get("z", 0), b.get("z", 0)],
                        "kind": "hud_corner",
                    }
                )

    # Low-vision: pitch highway canvas should be tall enough when visible
    a11y = []
    for el in items:
        if el.get("sel") == "#pitch-canvas" and el.get("visible") and el.get("h", 0) > 0:
            if el["h"] < 280:
                a11y.append(
                    {
                        "sel": "#pitch-canvas",
                        "msg": f"highway height {el['h']:.0f}px < 280px (low-vision target)",
                        "box": [el["x"], el["y"], el["w"], el["h"]],
                    }
                )
        if el.get("sel") == "#highway-stage" and el.get("visible") and el.get("h", 0) > 0:
            if el["h"] < 360:
                a11y.append(
                    {
                        "sel": "#highway-stage",
                        "msg": f"stage height {el['h']:.0f}px < 360px",
                        "box": [el["x"], el["y"], el["w"], el["h"]],
                    }
                )

    return {
        "label": data.get("label"),
        "viewport": [vw, vh],
        "n_visible": len(items),
        "overlaps": overlaps,
        "overflows": overflows,
        "fold_issues": fold_issues,
        "a11y": a11y,
        "critical": len(overlaps)
        + len([o for o in overflows if "overflow" in o["msg"]])
        + len(fold_issues)
        + len(a11y),
    }


def main() -> int:
    files = sorted(GEO.glob("*.json"))
    files = [f for f in files if not f.name.startswith("_")]
    if not files:
        print("No geometry files in", GEO)
        return 2

    report = {
        "pages": [],
        "total_overlaps": 0,
        "total_overflows": 0,
        "total_fold_issues": 0,
        "total_a11y": 0,
        "total_critical": 0,
    }
    for f in files:
        r = analyze_file(f)
        report["pages"].append(r)
        report["total_overlaps"] += len(r["overlaps"])
        report["total_overflows"] += len(r["overflows"])
        report["total_fold_issues"] += len(r.get("fold_issues") or [])
        report["total_a11y"] += len(r.get("a11y") or [])
        report["total_critical"] += r.get("critical") or 0

    out = GEO / "_analysis_report.json"
    out.write_text(json.dumps(report, indent=2))

    # Human summary
    print("=== Geometry forensic report ===")
    print(f"Pages analyzed: {len(report['pages'])}")
    print(f"Peer overlaps: {report['total_overlaps']}")
    print(f"Overlay overflows: {report['total_overflows']}")
    print(f"Fold (above-the-fold) issues: {report['total_fold_issues']}")
    print(f"A11y highway height: {report['total_a11y']}")
    print(f"Critical total: {report['total_critical']}")
    bad = [
        p
        for p in report["pages"]
        if p["overlaps"] or p["overflows"] or p.get("fold_issues") or p.get("a11y")
    ]
    for p in bad[:40]:
        print(f"\n## {p['label']}")
        for o in p["overlaps"][:8]:
            print(f"  OVERLAP area={o['area']} {o['a']} ∩ {o['b']} z={o['z']}")
            print(f"    A{o['a_box']} B{o['b_box']}")
        for o in p["overflows"][:8]:
            print(f"  OVERFLOW {o['sel']}: {o['msg']}")
        for o in (p.get("fold_issues") or [])[:8]:
            print(f"  FOLD {o['sel']}: {o['msg']}")
        for o in (p.get("a11y") or [])[:8]:
            print(f"  A11Y {o['sel']}: {o['msg']}")

    # Exit 1 if critical peer HUD overlaps, fold issues, or short highway
    critical = 0
    for p in report["pages"]:
        for o in p["overlaps"]:
            if ".hud-" in o["a"] or ".hud-" in o["b"] or "practice" in o["a"] or "practice" in o["b"]:
                critical += 1
        critical += len(p.get("fold_issues") or [])
        critical += len(p.get("a11y") or [])
    print(f"\nCritical HUD/control overlaps + fold + a11y: {critical}")
    print("Report:", out)
    return 1 if critical > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
