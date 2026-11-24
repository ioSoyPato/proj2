"""Rule-based policies: buy-and-hold, band rebalancing (PFA) and the behavioural
overlays (panic selling, performance chasing).

All are one class, ``RulePolicy``, so that a behavioural policy differs from the
disciplined PFA ONLY in the behaviour being measured:

* ``band = inf``                          -> buy-and-hold (baseline)
* ``band = b``                            -> PFA band rebalancing to the MILP target
* ``band = b`` + ``panic=(d, r)``         -> panic seller
* ``band = b`` + ``chase=(k, f)``         -> performance chaser
* both overlays                            -> "you, unassisted"

With d = 100% and k = 0 the behavioural policies are identical, path by path,
to the PFA, so any difference is the cost of the behaviour itself.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..simulator.engine import SimContext, State


@dataclass
class RulePolicy:
    key: str
    target: np.ndarray                 # (N,) MILP weights x0
    band: float = np.inf               # absolute drift band (fraction); inf = never rebalance
    panic_drawdown: float | None = None   # d
    reentry_recovery: float = 0.2      # r
    chase_intensity: float = 0.0       # k
    review_months: int = 12            # f
    n_winners: int = 3
    lookback: int = 12

    def reset(self, ctx: SimContext) -> None:
        n = ctx.n
        self._goal = np.repeat(self.target[None, :], n, axis=0)  # current target (chaser moves it)
        self._in_cash = np.zeros(n, dtype=bool)
        self._own_peak = np.full(n, ctx.initial_wealth)
        self._shadow = np.ones(n)
        self._trough = np.ones(n)
        cash = np.zeros(self.target.shape[0]); cash[ctx.cash_index] = 1.0
        self._cash_w = cash
        risky = np.ones(self.target.shape[0], dtype=bool); risky[ctx.cash_index] = False
        self._risky = risky

    # -- behavioural pieces -------------------------------------------------
    def _chase_goal(self, s: State, ctx: SimContext) -> np.ndarray:
        """(1-k) x0 + k * equal weight on the last 12 months' top performers."""
        trail = ctx.trailing(s.t, self.lookback)               # (n, 12, N), known at t
        cum = np.prod(1.0 + trail, axis=1) - 1.0                # (n, N)
        cum[:, ~self._risky] = -np.inf                          # nobody chases T-bills
        top = np.argpartition(-cum, self.n_winners - 1, axis=1)[:, : self.n_winners]
        win = np.zeros_like(cum)
        np.put_along_axis(win, top, 1.0 / self.n_winners, axis=1)
        k = self.chase_intensity
        return (1 - k) * self.target[None, :] + k * win

    def decide(self, s: State, ctx: SimContext) -> np.ndarray:
        if s.t == 0:
            return self._goal.copy()

        # disciplined part: band rule toward the current goal
        drift = np.abs(s.w - self._goal).max(axis=1)
        x = np.where((drift > self.band)[:, None], self._goal, s.w)

        # chaser: at each review date the client moves the target AND trades to it
        if self.chase_intensity > 0 and s.t % self.review_months == 0:
            self._goal = self._chase_goal(s, ctx)
            x = self._goal.copy()

        if self.panic_drawdown is not None and self.panic_drawdown < 1.0:
            # shadow value of the portfolio the client left (target held, rebalanced monthly)
            last = ctx.trailing(s.t, 1)[:, 0, :]
            self._shadow *= 1.0 + last @ self.target
            self._trough = np.where(self._in_cash, np.minimum(self._trough, self._shadow), self._shadow)

            self._own_peak = np.where(self._in_cash, self._own_peak, np.maximum(self._own_peak, s.W))
            dd = 1.0 - s.W / self._own_peak
            sell = (~self._in_cash) & (dd >= self.panic_drawdown)
            back = self._in_cash & (self._shadow / self._trough - 1.0 >= self.reentry_recovery)

            self._in_cash = (self._in_cash | sell) & ~back
            self._trough = np.where(sell, self._shadow, self._trough)
            self._own_peak = np.where(back, s.W, self._own_peak)  # anchor resets after re-entry
            x = np.where(self._in_cash[:, None], self._cash_w[None, :], x)
            x = np.where(back[:, None], self._goal, x)
        return x
