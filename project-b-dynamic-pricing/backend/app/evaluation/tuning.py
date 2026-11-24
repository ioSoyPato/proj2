"""Policy tuning — always on TUNING seeds, never on evaluation seeds."""
from __future__ import annotations

import itertools
import time

import numpy as np

from ..policies.dla import Lookahead
from ..policies.rules import FixedPrice, PriceSchedule
from ..simulator.engine import Scenarios, simulate
from ..simulator.params import MarketParams
from .runner import run


def tune_fixed(params: MarketParams, sc: Scenarios) -> tuple[FixedPrice, list[dict]]:
    """Baseline: evaluate every grid price, keep the best mean revenue."""
    curve = []
    for p in params.grid:
        r = simulate(FixedPrice(float(p)), params, sc)
        curve.append({"price": float(p), "mean_revenue": float(r.revenue.mean()),
                      "sellout_prob": float(r.sellout.mean())})
    best = max(curve, key=lambda c: c["mean_revenue"])
    return FixedPrice(best["price"]), curve


def _pfa_value(params: MarketParams, sc: Scenarios, x: tuple[float, float, float]) -> float:
    return float(simulate(PriceSchedule(*x), params, sc).revenue.mean())


def tune_pfa(params: MarketParams, sc: Scenarios, start: tuple[float, float, float] | None = None,
             coarse: bool = True, max_evals: int = 900) -> tuple[PriceSchedule, dict]:
    """Coarse grid over (P0, drift, k) followed by a compass/pattern search."""
    t0 = time.time()
    cache: dict[tuple, float] = {}

    def f(x):
        key = tuple(round(v, 4) for v in x)
        if key not in cache:
            cache[key] = _pfa_value(params, sc, key)
        return cache[key]

    span = params.price_max - params.price_min
    if coarse:
        p0s = np.arange(params.price_min, params.price_max + 1e-9, max(params.price_step, span / 16))
        drifts = np.linspace(-0.25 * span, 0.5 * span, 7)
        ks = [0.0, 150.0, 400.0, 800.0, 1400.0]
        best = max(itertools.product(p0s, drifts, ks), key=f)
    else:
        best = start if start is not None else (float(np.median(params.grid)), 0.0, 400.0)
        f(best)
    if start is not None and f(start) > f(best):
        best = start
    steps = np.array([params.price_step, params.price_step * 2, 200.0])
    x = np.array(best, dtype=float)
    fx = f(tuple(x))
    while steps[0] >= params.price_step / 4 and len(cache) < max_evals:
        improved = False
        for i in range(3):
            for sgn in (+1, -1):
                y = x.copy()
                y[i] += sgn * steps[i]
                if i == 2 and y[i] < 0:
                    continue
                fy = f(tuple(y))
                if fy > fx + 1e-6:
                    x, fx, improved = y, fy, True
        if not improved:
            steps = steps / 2
    pol = PriceSchedule(float(x[0]), float(x[1]), float(x[2]))
    return pol, {"evaluations": len(cache), "tuning_mean_revenue": fx, "seconds": round(time.time() - t0, 1)}


def tune_dla(params: MarketParams, sc: Scenarios, grid_n0=(50.0, 150.0, 300.0, 800.0, float("inf"))
             ) -> tuple[Lookahead, list[dict]]:
    """Prior strength of the demand-level belief (``inf`` = no learning)."""
    rows = []
    for n0 in grid_n0:
        r = run(Lookahead(prior_n0=n0), params, sc, parallel=True)
        rows.append({"prior_n0": n0 if np.isfinite(n0) else None, "mean_revenue": float(r.revenue.mean())})
    best = max(rows, key=lambda r: r["mean_revenue"])
    n0 = best["prior_n0"] if best["prior_n0"] is not None else float("inf")
    return Lookahead(prior_n0=n0), rows
