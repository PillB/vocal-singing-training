"""Tests for the study's bookkeeping: collect.py and the decision rules in analyze.py.

Run: python -m unittest qa/customer-research/test_rules.py   (no models needed)

Each test names the wrong behaviour it exists to catch, and mutate_ssr.py plants
each one in a copy of the code and checks that this file turns red.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, os.environ.get("SSR_MODULE_DIR", str(HERE)))
import analyze  # noqa: E402
import collect  # noqa: E402


def journal(lines):
    f = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False)
    f.write("\n".join(json.dumps(x) for x in lines))
    f.close()
    return f.name


class CollectRounds(unittest.TestCase):
    """Batch ids repeat across rounds: C0-es-0 holds different people in r1 and r2."""

    def setUp(self):
        self.rounds = collect.indexes()
        self.r1 = set(self.rounds["r1"]["C0-es-0"]["ids"])
        self.r2 = set(self.rounds["r2"]["C0-es-0"]["ids"])

    def test_the_premise_holds_the_same_batch_id_has_other_people(self):
        self.assertNotEqual(self.r1, self.r2)

    def test_a_round_2_answer_is_checked_against_round_2_membership(self):
        # Wrong behaviour: the first index found wins, so round 2's answers are
        # filtered by round 1's batch and most of them are dropped as strays
        # (the bug that first returned 10 of 64 answers for C0).
        answers = [{"id": i, "trial": "t", "paid": "p", "hesitation": "h", "understood": "u"} for i in sorted(self.r2)]
        path = journal([{"type": "started", "key": "k1", "label": "r2:C0-es-0"},
                        {"type": "result", "key": "k1", "result": {"answers": answers}}])
        rows, short = collect.load([path])
        os.unlink(path)
        self.assertEqual(short, [])
        self.assertEqual({r["id"] for r in rows}, self.r2)

    def test_run_tags_map_to_their_round(self):
        # Wrong behaviour: r1h0 not recognised as round 1, or an unknown tag
        # silently borrowing some round's batches.
        self.assertEqual(collect.round_of("r1h0", self.rounds), "r1")
        self.assertEqual(collect.round_of("r1h1", self.rounds), "r1")
        self.assertEqual(collect.round_of("r2", self.rounds), "r2")
        with self.assertRaises(KeyError):
            collect.round_of("think-aloud", self.rounds)


def people(n=64):
    bands = ["18-24", "25-34", "35-49", "50-64", "65-80"]
    return [{"id": f"R{i:02d}", "age_band": bands[i % 5], "language": "es" if i % 3 else "en"} for i in range(n)]


def tables(shift_f, noise=0.6, seed=7, cards=("C0", "C0p", "F")):
    """Each person's rating of today is drawn once; C0p equals it plus noise; F adds shift_f."""
    rng = np.random.default_rng(seed)
    ps = people()
    base = {p["id"]: rng.uniform(2.5, 4.5) for p in ps}
    t = {}
    for c in cards:
        add = shift_f if c == "F" else 0.0
        t[c] = {i: base[i] + add + rng.normal(0, noise if c != "C0" else 0.0) for i in base}
    return {q: t for q in analyze.QUESTIONS}, ps


class Rules(unittest.TestCase):

    def test_split_half_is_not_reported_for_three_cards(self):
        # Wrong behaviour: a "reliability" of about -2,000 from three equal
        # means (round 2), which reads as a failed gate instead of no gate.
        t, ps = tables(0.0)
        self.assertIsNone(analyze.split_half(t["trial"], [p["id"] for p in ps]))
        out = analyze.analyse_tables(t, ps)
        self.assertNotIn("V3_split_half_trial", out["gates"])

    def test_split_half_still_judges_cards_that_differ(self):
        # The guard must not switch the gate off where it has work to do.
        rng = np.random.default_rng(3)
        ids = [p["id"] for p in people()]
        t = {f"K{k}": {i: k * 0.3 + rng.normal(0, 0.3) for i in ids} for k in range(9)}
        self.assertGreater(analyze.split_half(t, ids), 0.7)

    def test_not_worse_needs_the_whole_interval_above_the_margin(self):
        # Wrong behaviour: judging non-inferiority on the point estimate. A mean
        # of -0.05 with an interval reaching -0.2 has not shown "not worse".
        t, ps = tables(0.0, noise=0.2)
        for k, i in enumerate(sorted(t["trial"]["C0"])):  # differences +0.85, -0.95, ...: mean -0.05, wide
            t["trial"]["F"][i] = t["trial"]["C0"][i] + (0.85 if k % 2 else -0.95)
        d = analyze.analyse_tables(t, ps)["questions"]["trial"]["vs_today"]["all"]["F"]
        self.assertGreater(d["diff"], analyze.NI_MARGIN)
        self.assertLess(d["lo"], analyze.NI_MARGIN)
        self.assertFalse(analyze.analyse_tables(t, ps)["not_worse_on_trial"]["F"])

    def test_a_copy_equal_to_today_passes_and_a_clearly_worse_one_fails(self):
        same, ps = tables(0.0, noise=0.2)
        worse, _ = tables(-0.4, noise=0.2)
        self.assertTrue(analyze.analyse_tables(same, ps)["not_worse_on_trial"]["F"])
        self.assertFalse(analyze.analyse_tables(worse, ps)["not_worse_on_trial"]["F"])


def panel_tables(n_paid_shift):
    """Nine cards with a real spread, so split-half can pass. F is clearly better on both
    questions; the bad offer N is clearly worse on trial and shifted by n_paid_shift on paying."""
    rng = np.random.default_rng(11)
    ps = people()
    base = {p["id"]: rng.uniform(2.0, 4.0) for p in ps}
    shifts = {"C0": (0, 0), "C0p": (0, 0), "F": (0.6, 0.6), "N": (-1.0, n_paid_shift), "P": (0, 0.6),
              "K1": (0.3, 0.3), "K2": (-0.3, -0.3), "K3": (0.9, 0.9), "K4": (-0.6, -0.6)}
    t = {q: {} for q in analyze.QUESTIONS}
    for c, (st, sp) in shifts.items():
        for q, sh in zip(analyze.QUESTIONS, (st, sp)):
            t[q][c] = {i: base[i] + sh + rng.normal(0, 0.15) for i in base}
    return t, ps


class Verdicts(unittest.TestCase):

    def test_a_clear_win_is_called_when_every_gate_passes(self):
        # Control for the two tests below: the rules can say "better" at all.
        t, ps = panel_tables(-1.0)
        out = analyze.analyse_tables(t, ps)
        self.assertTrue(all(out["gates"].values()), out["gates"])
        self.assertEqual(out["verdicts"]["paid"]["all"]["F"], "beats today and placebo")

    def test_a_question_that_failed_its_checks_gets_no_verdict(self):
        # Wrong behaviour: round 1 printed "beats today and placebo" for C4 on
        # paying although the bad offer rated no lower than today on paying.
        t, ps = panel_tables(0.0)
        out = analyze.analyse_tables(t, ps)
        self.assertFalse(out["gates"]["V1_bad_offer_lower"])
        self.assertEqual(out["verdicts"]["paid"]["all"]["F"], analyze.NOT_JUDGED)

    def test_nothing_is_called_better_while_any_gate_failed(self):
        # Pre-registered: "all required before any concept is called better". Trial
        # passed its own checks here, but the bad offer failed on paying.
        t, ps = panel_tables(0.0)
        out = analyze.analyse_tables(t, ps)
        self.assertTrue(analyze.question_valid(out, "trial"))
        self.assertEqual(out["verdicts"]["trial"]["all"]["F"], "no evidence of a difference")


if __name__ == "__main__":
    unittest.main()
