"""Summary statistics for one policy's simulated outcomes."""
from __future__ import annotations

import numpy as np

from ..profile.questionnaire import inverse_value, value_function
from ..simulator.engine import SimResult

Z95 = 1.959963984540054


def describe(x: np.ndarray) -> dict:
    """mean, std, P5/P50/P95 and a normal-approximation 95% CI for the mean."""
    x = np.asarray(x, dtype=float)
    n = x.shape[0]
    m = float(x.mean()); sd = float(x.std(ddof=1))
    half = Z95 * sd / np.sqrt(n)
    return {
        "mean": m, "std": sd,
        "p5": float(np.percentile(x, 5)), "p25": float(np.percentile(x, 25)),
        "median": float(np.median(x)),
        "p75": float(np.percentile(x, 75)), "p95": float(np.percentile(x, 95)),
        "ci_low": m - half, "ci_high": m + half, "n": n,
    }


def pt_values(terminal: np.ndarray, reference: float, alpha: float, beta: float, lam: float) -> np.ndarray:
    """v(W_T / Ref - 1): outcome as a fraction of the reference point."""
    return value_function(terminal / reference - 1.0, alpha, beta, lam)


def summarize(res: SimResult, reference: float, profile: dict, initial_wealth: float,
              horizon_years: float) -> dict:
    a, b, l = profile["alpha"], profile["beta"], profile["lam"]
    WT = res.wealth[:, -1]
    v = pt_values(WT, reference, a, b, l)
    pt = describe(v)
    ce_frac = inverse_value(pt["mean"], a, b, l)
    cagr = (WT / initial_wealth) ** (1.0 / horizon_years) - 1.0
    q = np.percentile(res.wealth, [5, 25, 50, 75, 95], axis=0)
    return {
        "pt_value": pt,
        "pt_certainty_equivalent": reference * (1.0 + ce_frac),
        "terminal_wealth": describe(WT),
        "cagr": describe(cagr),
        "prob_below_reference": float((WT < reference).mean()),
        "prob_loss": float((WT < initial_wealth).mean()),
        "max_drawdown": describe(res.max_drawdown),
        "annual_turnover": float(res.turnover.mean() / horizon_years),
        "mean_costs": float(res.costs.mean()),
        "mean_cash_months": float(res.cash_months.mean()),
        "mean_trades": float(res.n_trades.mean()),
        "fan": {"p5": q[0], "p25": q[1], "p50": q[2], "p75": q[3], "p95": q[4]},
    }


def paired_difference(a: np.ndarray, b: np.ndarray) -> dict:
    """Statistics of a - b on the SAME scenarios (common random numbers)."""
    d = np.asarray(a) - np.asarray(b)
    out = describe(d)
    out["share_positive"] = float((d > 0).mean())
    return out
