"""Baseline (best fixed price) and the price-schedule rule (PFA)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..simulator.engine import State
from ..simulator.params import MarketParams


def nearest_index(grid: np.ndarray, price: np.ndarray | float) -> np.ndarray:
    price = np.asarray(price, dtype=float)
    step = grid[1] - grid[0] if len(grid) > 1 else 1.0
    return np.clip(np.rint((price - grid[0]) / step), 0, len(grid) - 1).astype(np.int64)


@dataclass
class FixedPrice:
    """Baseline — one price for the whole window.  Tunable: the price itself."""
    price: float
    name: str = "fixed"

    def reset(self, params: MarketParams, n: int) -> None:
        self._idx = int(nearest_index(params.grid, self.price))

    def act(self, state: State, params: MarketParams) -> np.ndarray:
        return np.full(state.seats.shape[0], self._idx, dtype=np.int64)


def expected_cum_share(params: MarketParams) -> np.ndarray:
    """F_t: share of expected (pre-scarcity) arrivals that occurs BEFORE day t."""
    lam = params.arrival_rates()
    return np.concatenate([[0.0], np.cumsum(lam)[:-1]]) / lam.sum()


@dataclass
class PriceSchedule:
    """PFA — a closed-form rule of days left and seats remaining:

        p_t = P0 + a · (t / (T−1)) + k · (sold_t − C·F_t) / C        (rounded to grid)

    * ``P0``: opening price ($);
    * ``a``:  planned drift over the window ($; >0 means prices rise toward the event);
    * ``k``:  pace sensitivity ($ per unit of capacity ahead of the booking curve):
      if sales run ahead of a sell-out-by-the-event curve shaped like the arrival
      curve, the price goes up; if they lag, it goes down.
    """
    p0: float
    drift: float
    k: float
    name: str = "pfa"

    def reset(self, params: MarketParams, n: int) -> None:
        self._F = expected_cum_share(params)

    def price(self, t: int, sold: np.ndarray, params: MarketParams) -> np.ndarray:
        T, C = params.horizon, params.capacity
        gap = (np.asarray(sold, dtype=float) - C * self._F[t]) / C
        return self.p0 + self.drift * (t / (T - 1)) + self.k * gap

    def act(self, state: State, params: MarketParams) -> np.ndarray:
        return nearest_index(params.grid, self.price(state.t, state.sold, params))
