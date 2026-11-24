"""CFA: re-solve the Part 2 MILP every 12 months on data available at that time.

At each re-solve date t (12, 24, ...) the scenario matrix is the last ``L``
months of the information set (history + months already simulated on that
path), and the CVaR cap is ``theta * C(lambda)``. The deterministic MILP is the
"cost function approximation" of the stochastic problem; ``L`` and ``theta``
are the tunable parameters. Between re-solves the portfolio drifts.

Thousands of small MILPs per run are spread over a process pool.
"""
from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, replace
import multiprocessing as mp

import numpy as np

from ..optimization.milp import MILPParams, solve_portfolio
from ..simulator.engine import SimContext, State

_POOL: ProcessPoolExecutor | None = None


def _pool() -> ProcessPoolExecutor | None:
    global _POOL
    workers = int(os.environ.get("CFA_WORKERS", min(8, os.cpu_count() or 1)))
    if workers <= 1:
        return None
    if _POOL is None:
        _POOL = ProcessPoolExecutor(max_workers=workers, mp_context=mp.get_context("spawn"))
    return _POOL


def _solve_chunk(windows: np.ndarray, class_m: np.ndarray, params: MILPParams) -> np.ndarray:
    return np.stack([solve_portfolio(W, class_m, params).weights for W in windows])


def solve_many(windows: np.ndarray, class_m: np.ndarray, params: MILPParams) -> np.ndarray:
    """Solve one MILP per window (k, L, N) -> weights (k, N), in parallel when possible."""
    pool = _pool()
    if pool is None or len(windows) < 16:
        return _solve_chunk(windows, class_m, params)
    chunks = np.array_split(windows, min(len(windows), 4 * pool._max_workers))  # noqa: SLF001
    futs = [pool.submit(_solve_chunk, c, class_m, params) for c in chunks if len(c)]
    return np.concatenate([f.result() for f in futs])


@dataclass
class CFAPolicy:
    key: str
    target: np.ndarray
    milp: MILPParams           # carries the client's C(lambda) as cvar_cap
    lookback: int = 60         # L
    theta: float = 1.0         # cap multiplier
    every: int = 12

    def reset(self, ctx: SimContext) -> None:
        self._goal = np.repeat(self.target[None, :], ctx.n, axis=0)
        self._params = replace(self.milp, cvar_cap=self.milp.cvar_cap * self.theta)

    def decide(self, s: State, ctx: SimContext) -> np.ndarray:
        if s.t == 0:
            return self._goal.copy()
        if s.t % self.every:
            return s.w
        windows = ctx.trailing(s.t, self.lookback)
        self._goal = solve_many(windows, ctx.class_m, self._params)
        return self._goal.copy()
