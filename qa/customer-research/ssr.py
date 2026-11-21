"""Semantic similarity rating (SSR), after Maier et al. (2025).

"LLMs Reproduce Human Purchase Intent via Semantic Similarity Elicitation of
Likert Ratings", arXiv:2510.08338, appendix A.4.3. A free-text answer is
embedded, compared by cosine similarity with five anchor statements (one per
point of a 1-5 Likert scale), and turned into a probability mass function:

    p(r) ∝ γ(σ_r, t) − γ(σ_ℓ, t) + ε·δ(ℓ, r)          (eq. 8)
    p(r, T) ∝ p(r)^(1/T)                               (eq. 9)

where ℓ is the least similar anchor of the set. The minimum is subtracted
because the cosine similarities of any two short statements about buying are
close together; without it every pmf is nearly flat (the paper says so, and
tests/test_ssr.py plants exactly that defect to show the test turns red).
The pmf is averaged over several anchor sets, as in the paper (six there).

What this module does not do: it does not make the answers. Those come from
synthetic respondents (qa/customer-research/README.md). And it is not
validated against human answers for this product; the paper validated it on
57 personal-care surveys, a different domain.
"""
from __future__ import annotations

import functools
import math
from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np

# Multilingual sentence encoders that run locally (fastembed / ONNX). The paper
# used OpenAI's text-embedding-3-small; it also reports that the large model
# changed nothing. We have no OpenAI key here, so we use three local models and
# report how much the result moves between them (README: robustness).
MODELS = {
    "mpnet": "sentence-transformers/paraphrase-multilingual-mpnet-base-v2",
    "minilm": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    "e5": "intfloat/multilingual-e5-large",
}
# e5 was trained with a "query: " / "passage: " prefix; symmetric similarity
# uses "query: " on both sides (model card).
PREFIX = {"e5": "query: "}


@functools.lru_cache(maxsize=None)
def _model(key: str):
    from fastembed import TextEmbedding  # imported late: tests can stub embed()

    return TextEmbedding(MODELS[key])


def embed(texts: Sequence[str], model: str = "mpnet") -> np.ndarray:
    """Unit-norm embeddings, one row per text."""
    prefix = PREFIX.get(model, "")
    vecs = np.array(list(_model(model).embed([prefix + t for t in texts])), dtype=np.float64)
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return vecs / norms


def pmf_from_similarities(sims: Sequence[float], eps: float = 0.0, temperature: float = 1.0) -> np.ndarray:
    """Equations 8 and 9 of the paper for one anchor set (five similarities)."""
    s = np.asarray(sims, dtype=np.float64)
    if s.shape != (5,):
        raise ValueError(f"an anchor set has five statements, got {s.shape}")
    low = int(np.argmin(s))
    p = s - s[low]
    p[low] += eps
    total = p.sum()
    if not math.isfinite(total) or total <= 0:
        # Every anchor equally similar: the answer carries no information
        # about the scale. Uniform is the honest answer, not a crash.
        return np.full(5, 0.2)
    p = p / total
    if temperature != 1.0:
        if temperature <= 0:
            raise ValueError("temperature must be > 0")
        p = np.power(p, 1.0 / temperature)
        p = p / p.sum()
    return p


@dataclass(frozen=True)
class Rating:
    pmf: np.ndarray  # shape (5,), averaged over anchor sets

    @property
    def mean(self) -> float:
        return float(np.dot(self.pmf, np.arange(1, 6)))

    @property
    def top2(self) -> float:
        """Share of mass on 4 and 5, the usual 'top-2 box'."""
        return float(self.pmf[3] + self.pmf[4])


class Scorer:
    """Rates many answers against fixed anchor sets with one embedding model."""

    def __init__(self, anchor_sets: Sequence[Sequence[str]], model: str = "mpnet",
                 eps: float = 0.0, temperature: float = 1.0, embedder=None):
        sets = [list(a) for a in anchor_sets]
        if not sets or any(len(a) != 5 for a in sets):
            raise ValueError("each anchor set needs exactly five statements, 1 to 5")
        self.model = model
        self.eps = eps
        self.temperature = temperature
        self._embed = embedder or (lambda texts: embed(texts, model))
        flat = [s for a in sets for s in a]
        self._anchors = self._embed(flat).reshape(len(sets), 5, -1)

    def rate_many(self, answers: Iterable[str]) -> list[Rating]:
        answers = list(answers)
        if not answers:
            return []
        vecs = self._embed(answers)  # (n, d)
        # sims[n, set, point]
        sims = np.einsum("nd,spd->nsp", vecs, self._anchors)
        out = []
        for row in sims:
            pm = np.mean([pmf_from_similarities(r, self.eps, self.temperature) for r in row], axis=0)
            out.append(Rating(pm))
        return out

    def rate(self, answer: str) -> Rating:
        return self.rate_many([answer])[0]


def ks_similarity(p: Sequence[float], q: Sequence[float]) -> float:
    """1 − Kolmogorov–Smirnov distance between two pmfs on 1..5 (paper eq. 3)."""
    return 1.0 - float(np.max(np.abs(np.cumsum(p) - np.cumsum(q))))
