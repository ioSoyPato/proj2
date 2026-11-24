"""Run policies on scenario sets (optionally in parallel) and summarise results."""
from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import get_context

import numpy as np

from ..simulator.engine import Policy, Scenarios, SimResult, simulate
from ..simulator.params import MarketParams

_POOL: ProcessPoolExecutor | None = None


def default_workers() -> int:
    env = os.environ.get("PRICING_WORKERS")
    if env:
        return max(1, int(env))
    return max(1, min(10, (os.cpu_count() or 2)))


def _pool() -> ProcessPoolExecutor:
    global _POOL
    if _POOL is None:
        _POOL = ProcessPoolExecutor(max_workers=default_workers(), mp_context=get_context("spawn"))
    return _POOL


def _sim_chunk(args):
    policy, params, sc = args
    from ..policies import dla  # noqa: F401  (ensures counters exist in the worker)
    res = simulate(policy, params, sc)
    return res, dict(dla.SOLVE_COUNTS)


def concat_results(parts: list[SimResult]) -> SimResult:
    fields = SimResult.__dataclass_fields__.keys()
    return SimResult(**{f: np.concatenate([getattr(p, f) for p in parts], axis=0) for f in fields})


def run(policy: Policy, params: MarketParams, sc: Scenarios, parallel: bool = False,
        counts: dict | None = None) -> SimResult:
    """Simulate ``policy``; with ``parallel`` the scenarios are split across
    worker processes (identical results — each scenario owns its random numbers)."""
    workers = default_workers()
    if not parallel or workers == 1 or sc.n < 2 * workers:
        return simulate(policy, params, sc)
    chunks = np.array_split(np.arange(sc.n), min(sc.n, workers * 3))
    jobs = [(policy, params, sc.subset(c)) for c in chunks if len(c)]
    parts, total = [], {"gurobi": 0, "highs": 0, "infeasible": 0}
    for res, c in _pool().map(_sim_chunk, jobs):
        parts.append(res)
        for k, v in c.items():
            total[k] = total.get(k, 0) + v
    if counts is not None:
        for k, v in total.items():
            counts[k] = counts.get(k, 0) + v
    return concat_results(parts)


# ---------------------------------------------------------------------------
# Summaries
# ---------------------------------------------------------------------------
Z95 = 1.959963984540054


def wilson(k: int, n: int, z: float = Z95) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (float(max(0.0, c - h)), float(min(1.0, c + h)))


def histogram(x: np.ndarray, edges: np.ndarray) -> dict:
    counts, e = np.histogram(x, bins=edges)
    return {"counts": counts.tolist(), "edges": e.tolist()}


def summarize(res: SimResult, params: MarketParams) -> dict:
    rev = res.revenue
    n = rev.shape[0]
    mean, sd = float(rev.mean()), float(rev.std(ddof=1)) if n > 1 else 0.0
    se = sd / np.sqrt(n) if n > 1 else float("nan")
    k = int(res.sellout.sum())
    sold = res.sold.astype(float)
    avg_paid = np.divide(rev, sold, out=np.full(n, np.nan), where=sold > 0)
    so_days = res.sellout_day[res.sellout]
    prices = res.prices
    # median-revenue scenario: a "typical" path to show
    med_idx = int(np.argsort(rev)[n // 2])
    return {
        "n": n,
        "revenue": {"mean": mean, "std": sd, "se": se, "ci95": [mean - Z95 * se, mean + Z95 * se],
                    "p5": float(np.percentile(rev, 5)), "p25": float(np.percentile(rev, 25)),
                    "p50": float(np.percentile(rev, 50)), "p75": float(np.percentile(rev, 75)),
                    "p95": float(np.percentile(rev, 95)), "min": float(rev.min()), "max": float(rev.max())},
        "sellout": {"prob": k / n, "ci95": list(wilson(k, n)),
                    "mean_days_left_at_sellout": float(so_days.mean()) if k else None},
        "tickets": {"mean_sold": float(sold.mean()), "load_factor": float(sold.mean() / params.capacity),
                    "p5_sold": float(np.percentile(sold, 5)), "mean_unsold": float(params.capacity - sold.mean())},
        "avg_price_paid": float(np.nanmean(avg_paid)) if np.isfinite(avg_paid).any() else None,
        "price_path": {"mean": prices.mean(0).tolist(), "p10": np.percentile(prices, 10, axis=0).tolist(),
                       "p90": np.percentile(prices, 90, axis=0).tolist(),
                       "median_scenario": prices[med_idx].tolist()},
        "seats_path": {"mean": res.seats.mean(0).tolist(), "median_scenario": res.seats[med_idx].tolist()},
        "sales_path": {"mean": res.sales.mean(0).tolist()},
        "ref_path": {"mean": res.ref.mean(0).tolist()},
        "first_price": float(prices[0, 0]),
    }


def paired(res: SimResult, base: SimResult) -> dict:
    """Paired (CRN) difference in revenue vs a reference policy."""
    d = res.revenue - base.revenue
    n = d.shape[0]
    m, sd = float(d.mean()), float(d.std(ddof=1)) if n > 1 else 0.0
    se = sd / np.sqrt(n) if n > 1 else float("nan")
    return {"mean": m, "sd": sd, "ci95": [m - Z95 * se, m + Z95 * se], "win_rate": float((d > 0).mean()),
            "pct": m / float(base.revenue.mean()) if base.revenue.mean() else None}


def revenue_edges(results: list[SimResult], bins: int = 36) -> np.ndarray:
    lo = min(float(r.revenue.min()) for r in results)
    hi = max(float(r.revenue.max()) for r in results)
    if hi <= lo:
        hi = lo + 1.0
    return np.linspace(lo, hi, bins + 1)
