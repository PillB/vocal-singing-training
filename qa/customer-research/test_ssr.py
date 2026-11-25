"""Tests for ssr.py. Run: python -m unittest qa/customer-research/test_ssr.py

Each test names the wrong behaviour it exists to catch. `mutate_ssr.py` plants
those defects in a copy of ssr.py and checks that this file turns red on each
one (AGENTS.md: a test that cannot fail is not a test).

The model-backed tests need fastembed and the three models (about 2.5 GB on
first run); they read the study's own anchors (data/anchors.json) and a
labelled set of answers written by a different agent that never saw the
anchors (data/holdout-labelled.json), so the oracle is not computed by the
code under test.
"""
import json
import os
import sys
import unittest
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, os.environ.get("SSR_MODULE_DIR", str(HERE)))
import ssr  # noqa: E402

DATA = HERE / "data"


class Equation8(unittest.TestCase):
    """The pmf arithmetic alone, with no model."""

    def test_most_similar_anchor_gets_most_mass_and_least_similar_gets_none(self):
        # Wrong behaviour: sign flipped, or the minimum not subtracted (then the
        # least similar anchor keeps ~19% of the mass instead of 0).
        p = ssr.pmf_from_similarities([0.70, 0.72, 0.75, 0.80, 0.86])
        self.assertEqual(int(np.argmax(p)), 4)
        self.assertEqual(p[0], 0.0)
        self.assertAlmostEqual(p.sum(), 1.0, places=12)
        # (0.86-0.70)/(0+0.02+0.05+0.10+0.16) = 0.16/0.33
        self.assertAlmostEqual(p[4], 0.16 / 0.33, places=9)

    def test_close_similarities_still_give_a_peaked_pmf(self):
        # The reason the paper subtracts the minimum: raw cosines of short
        # statements differ by a few hundredths. Without the subtraction this
        # pmf is ~flat (max ≈ 0.2015); with it the peak is clear.
        p = ssr.pmf_from_similarities([0.801, 0.802, 0.803, 0.806, 0.811])
        self.assertGreater(p[4], 0.5)

    def test_epsilon_gives_the_least_similar_anchor_some_mass(self):
        p0 = ssr.pmf_from_similarities([0.1, 0.2, 0.3, 0.4, 0.5], eps=0.0)
        p1 = ssr.pmf_from_similarities([0.1, 0.2, 0.3, 0.4, 0.5], eps=0.1)
        self.assertEqual(p0[0], 0.0)
        self.assertGreater(p1[0], 0.0)

    def test_temperature_below_one_sharpens_and_above_one_flattens(self):
        sims = [0.1, 0.2, 0.3, 0.4, 0.5]
        ent = lambda p: float(-(p[p > 0] * np.log(p[p > 0])).sum())  # noqa: E731
        base = ent(ssr.pmf_from_similarities(sims))
        self.assertLess(ent(ssr.pmf_from_similarities(sims, temperature=0.5)), base)
        self.assertGreater(ent(ssr.pmf_from_similarities(sims, temperature=2.0)), base)

    def test_identical_similarities_are_uniform_not_a_crash(self):
        p = ssr.pmf_from_similarities([0.5] * 5)
        np.testing.assert_allclose(p, [0.2] * 5)

    def test_averaging_over_sets(self):
        # Two anchor sets that disagree: the result must be their mean, not the
        # first set alone (wrong behaviour: only Σ_0 used).
        vec = {"a1": [1, 0], "a2": [0.9, 0.1], "a3": [0.5, 0.5], "a4": [0.1, 0.9], "a5": [0, 1],
               "b1": [0, 1], "b2": [0.1, 0.9], "b3": [0.5, 0.5], "b4": [0.9, 0.1], "b5": [1, 0],
               "ans": [1, 0]}

        def fake(texts):
            v = np.array([vec[t] for t in texts], dtype=float)
            return v / np.linalg.norm(v, axis=1, keepdims=True)

        one = ssr.Scorer([["a1", "a2", "a3", "a4", "a5"]], embedder=fake).rate("ans")
        both = ssr.Scorer([["a1", "a2", "a3", "a4", "a5"], ["b1", "b2", "b3", "b4", "b5"]], embedder=fake).rate("ans")
        self.assertLess(one.mean, 2.0)  # answer sits on a1
        self.assertAlmostEqual(both.mean, 3.0, places=6)  # symmetric sets cancel

    def test_ks_similarity(self):
        self.assertAlmostEqual(ssr.ks_similarity([0, 0, 0, 0, 1], [0, 0, 0, 0, 1]), 1.0)
        self.assertAlmostEqual(ssr.ks_similarity([1, 0, 0, 0, 0], [0, 0, 0, 0, 1]), 0.0)
        self.assertAlmostEqual(ssr.ks_similarity([0.5, 0, 0, 0, 0.5], [0, 0, 0, 0, 1]), 0.5)
        # Ordinality (wrong behaviour: comparing pmfs point by point gives 0.7
        # here; the CDFs are 0.6 apart at 2, so the similarity is 0.4).
        self.assertAlmostEqual(ssr.ks_similarity([0.3, 0.3, 0.4, 0, 0], [0, 0, 0.4, 0.3, 0.3]), 0.4)


def _have_models():
    try:
        import fastembed  # noqa: F401
    except ImportError:
        return False
    return (DATA / "anchors.json").exists() and (DATA / "holdout-labelled.json").exists()


@unittest.skipUnless(_have_models() or os.environ.get("SSR_REQUIRE_MODELS"), "needs fastembed and data/")
class AgainstLabelledAnswers(unittest.TestCase):
    """The real models, the study's anchors, answers labelled by someone else."""

    @classmethod
    def setUpClass(cls):
        cls.anchors = json.loads((DATA / "anchors.json").read_text())
        cls.items = json.loads((DATA / "holdout-labelled.json").read_text())["items"]

    def _score(self, question, lang, model):
        items = [i for i in self.items if i["question"] == question and i["lang"] == lang]
        self.assertGreaterEqual(len(items), 20, f"holdout has {question}/{lang}")
        sc = ssr.Scorer(self.anchors[question][lang], model=model)
        got = np.array([r.mean for r in sc.rate_many([i["text"] for i in items])])
        want = np.array([i["label"] for i in items], dtype=float)
        return got, want

    def test_ratings_follow_the_labels_in_every_language_question_and_model(self):
        # Wrong behaviour: a mapping with no signal (flat pmf, sign flip, a
        # language whose anchors do not match) gives rank correlation near 0.
        from scipy.stats import spearmanr

        for model in ("mpnet", "minilm", "e5"):
            for q in ("trial", "paid"):
                for lang in ("es", "en"):
                    got, want = self._score(q, lang, model)
                    rho = spearmanr(got, want).statistic
                    with self.subTest(model=model, q=q, lang=lang):
                        self.assertGreater(rho, 0.6, f"spearman {rho:.2f}")

    def test_clear_yes_rates_above_clear_no(self):
        # Wrong behaviour: the scale's ends swapped or compressed to the middle.
        for model in ("mpnet", "minilm", "e5"):
            for q in ("trial", "paid"):
                for lang in ("es", "en"):
                    got, want = self._score(q, lang, model)
                    with self.subTest(model=model, q=q, lang=lang):
                        self.assertGreater(got[want == 5].mean() - got[want == 1].mean(), 1.0)


if __name__ == "__main__":
    unittest.main()
