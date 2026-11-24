"""Vectorised Powell simulator: one loop over months, all scenarios at once.

State          S_t = (W_t, w_t, P_t, H_t)     wealth, pre-trade weights, running peak,
                                              return history available at t
Decision       x_t = X^pi(S_t)                 post-trade target weights (sum to 1, >= 0)
Exogenous      R_{t+1}                         next month's asset returns (bootstrap)
Transition     W_t^+ = W_t (1 - c ||x_t - w_t||_1)
               W_{t+1} = W_t^+ (1 + x_t^T R_{t+1})
               w_{t+1} = x_t o (1 + R_{t+1}) / (1 + x_t^T R_{t+1})
               P_{t+1} = max(P_t, W_{t+1})
Objective      max_pi E[ v( W_T / Ref - 1 ) ]  (prospect-theory value)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import numpy as np


@dataclass
class SimContext:
    """Everything fixed for one simulation run (shared by every policy => CRN)."""

    hist: np.ndarray          # (T, N) historical returns, known before t = 0
    paths: np.ndarray         # (n, H, N) simulated returns, the exogenous information
    class_m: np.ndarray       # (G, N)
    cash_index: int
    cost: float
    initial_wealth: float
    _ext: np.ndarray | None = field(default=None, repr=False)

    @property
    def n(self) -> int:
        return self.paths.shape[0]

    @property
    def horizon(self) -> int:
        return self.paths.shape[1]

    @property
    def n_hist(self) -> int:
        return self.hist.shape[0]

    def extended(self) -> np.ndarray:
        """(n, T + H, N): history followed by each simulated path."""
        if self._ext is None:
            T, N = self.hist.shape
            ext = np.empty((self.n, T + self.horizon, N))
            ext[:, :T] = self.hist[None]
            ext[:, T:] = self.paths
            self._ext = ext
        return self._ext

    def trailing(self, t: int, months: int) -> np.ndarray:
        """(n, months, N) returns of the ``months`` months before decision time t.
        Only information available at t is returned (months t-months .. t-1)."""
        end = self.n_hist + t
        return self.extended()[:, end - months:end]


@dataclass
class State:
    t: int
    W: np.ndarray       # (n,)
    w: np.ndarray       # (n, N) pre-trade weights (zeros before the first purchase)
    peak: np.ndarray    # (n,)


class Policy(Protocol):
    key: str

    def reset(self, ctx: SimContext) -> None: ...

    def decide(self, s: State, ctx: SimContext) -> np.ndarray: ...


@dataclass
class SimResult:
    wealth: np.ndarray        # (n, H + 1)
    turnover: np.ndarray      # (n,) total one-way traded fraction, summed over months
    costs: np.ndarray         # (n,) dollars paid in transaction costs
    max_drawdown: np.ndarray  # (n,)
    cash_months: np.ndarray   # (n,) months spent >= 90% in the cash asset
    n_trades: np.ndarray      # (n,) months with a trade (after the initial purchase)


def simulate(policy: Policy, ctx: SimContext) -> SimResult:
    n, H, N = ctx.paths.shape
    W = np.full(n, ctx.initial_wealth)
    w = np.zeros((n, N))
    peak = W.copy()
    wealth = np.empty((n, H + 1)); wealth[:, 0] = W
    turnover = np.zeros(n); costs = np.zeros(n); mdd = np.zeros(n)
    cash_m = np.zeros(n); trades = np.zeros(n)
    policy.reset(ctx)
    for t in range(H):
        x = policy.decide(State(t, W, w, peak), ctx)
        traded = np.abs(x - w).sum(axis=1)
        traded[traded < 1e-10] = 0.0
        if t > 0:
            trades += traded > 0
        cost = ctx.cost * traded * W
        W = W - cost
        costs += cost
        turnover += traded if t > 0 else 0.0
        cash_m += x[:, ctx.cash_index] >= 0.9
        R = ctx.paths[:, t, :]
        growth = 1.0 + (x * R).sum(axis=1)
        W = W * growth
        w = x * (1.0 + R) / growth[:, None]
        peak = np.maximum(peak, W)
        mdd = np.maximum(mdd, 1.0 - W / peak)
        wealth[:, t + 1] = W
    return SimResult(wealth, turnover, costs, mdd, cash_m, trades)
