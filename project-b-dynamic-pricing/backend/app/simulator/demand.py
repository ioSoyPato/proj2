"""Buyer behaviour: the reference-dependent purchase rule and its closed form.

A potential buyer with willingness to pay W buys one ticket on day t iff

    W ≥ p_t + η·max(p_t − r_t, 0) − γ·max(r_t − p_t, 0)      (=: effective price  p̃_t)

With W ~ LogNormal(μ, σ), the probability that one arriving buyer purchases is

    q(p_t, r_t) = P(W ≥ p̃_t) = 1 − Φ((ln p̃_t − μ) / σ)       (q = 1 if p̃_t ≤ 0).
"""
from __future__ import annotations

import numpy as np
from scipy.special import ndtr


def effective_price(p: np.ndarray | float, r: np.ndarray | float, eta: float, gamma: float) -> np.ndarray:
    p = np.asarray(p, dtype=float)
    r = np.asarray(r, dtype=float)
    return p + eta * np.maximum(p - r, 0.0) - gamma * np.maximum(r - p, 0.0)


def buys(wtp: np.ndarray, p, r, eta: float, gamma: float) -> np.ndarray:
    """Agent-level purchase rule (used by tests and by the explicit-agent check)."""
    return np.asarray(wtp) >= effective_price(p, r, eta, gamma)


def purchase_prob(p, r, eta: float, gamma: float, mu: float, sigma: float) -> np.ndarray:
    pt = effective_price(p, r, eta, gamma)
    with np.errstate(divide="ignore", invalid="ignore"):
        z = (np.log(np.maximum(pt, 1e-12)) - mu) / sigma
    q = 1.0 - ndtr(z)
    return np.where(pt <= 0.0, 1.0, q)


def update_reference(r, p, theta: float):
    """r_{t+1} = θ r_t + (1 − θ) p_t."""
    return theta * np.asarray(r, dtype=float) + (1.0 - theta) * np.asarray(p, dtype=float)
