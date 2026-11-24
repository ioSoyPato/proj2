"""Block bootstrap of historical monthly returns.

A scenario is a sequence of historical month indices built from contiguous
blocks whose length is drawn uniformly from {3, ..., 6}. Blocks keep the
short-run autocorrelation and volatility clustering of real markets (a crash
month tends to be followed by another bad month) and preserve the full
cross-section of the 25 assets in every month.
"""
from __future__ import annotations

import numpy as np

from ..config import BLOCK_MAX, BLOCK_MIN


def block_bootstrap_indices(T: int, n_scenarios: int, horizon: int, seed: int,
                            block_min: int = BLOCK_MIN, block_max: int = BLOCK_MAX) -> np.ndarray:
    """Return an (n_scenarios, horizon) int array of historical month indices."""
    rng = np.random.default_rng(seed)
    out = np.empty((n_scenarios, horizon), dtype=np.int64)
    for s in range(n_scenarios):
        pos = 0
        while pos < horizon:
            L = int(rng.integers(block_min, block_max + 1))
            start = int(rng.integers(0, T - L + 1))
            take = min(L, horizon - pos)
            out[s, pos:pos + take] = np.arange(start, start + take)
            pos += take
    return out


def scenario_returns(hist: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """(n, H, N) simulated asset returns for the index matrix ``idx``."""
    return hist[idx]
