"""Part 2: mean-CVaR portfolio selection as a MILP (Rockafellar-Uryasev).

Decision vector ``x = [w (N), z (N), xi (S), eta]``::

    max   mu_hat^T w
    s.t.  sum_i w_i = 1,  w_i >= 0                       (fully invested, no shorts)
          sum_i z_i <= K,  z_i in {0, 1}                  (cardinality)
          l z_i <= w_i <= u z_i                           (min / max position if held)
          sum_{i in g} w_i <= s_max   for each class g    (class / sector cap)
          xi_s >= -r_s^T w - eta,  xi_s >= 0              (RU auxiliary losses)
          eta + 1/((1-a) S) sum_s xi_s <= C(lambda)       (CVaR_a of monthly loss)

``mu_hat`` shrinks each asset's historical mean halfway to the
cross-sectional average (the sample mean of 18 years of monthly data is too
noisy to be trusted asset by asset). If the CVaR cap is infeasible under the
other constraints, the minimum-CVaR portfolio is returned and flagged.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .solver import MILPProblem, solve


@dataclass
class MILPParams:
    cvar_cap: float = 0.055       # monthly CVaR limit C(lambda), as a fraction
    cvar_level: float = 0.95      # a
    max_assets: int = 8           # K
    min_weight: float = 0.03      # l
    max_weight: float = 0.30      # u
    max_class_weight: float = 0.45
    shrinkage: float = 0.5        # weight of the cross-sectional mean in mu_hat
    time_limit: float = 20.0


@dataclass
class MILPResult:
    weights: np.ndarray
    selected: np.ndarray
    expected_return: float        # monthly, raw historical mean of the portfolio
    expected_return_shrunk: float  # monthly, the objective value
    cvar: float                   # RU value at the optimum
    cvar_empirical: float         # direct empirical CVaR of the chosen weights
    var: float                    # eta at the optimum (VaR_a)
    volatility: float             # monthly std
    cap_binding: bool
    feasible_cap: bool
    solver: str
    status: str
    seconds: float
    extra: dict = field(default_factory=dict)


def empirical_cvar(port_returns: np.ndarray, level: float = 0.95) -> float:
    """CVaR of the loss L=-R with equal scenario weights, computed exactly
    (handles a fractional tail atom so it matches the RU minimum exactly)."""
    losses = np.sort(-np.asarray(port_returns))[::-1]
    S = losses.shape[0]
    tail = (1 - level) * S
    k = int(np.floor(tail))
    total = losses[:k].sum()
    if tail > k:
        total += (tail - k) * losses[k]
    return float(total / tail)


def _build(R: np.ndarray, mu_hat: np.ndarray, class_m: np.ndarray, p: MILPParams,
           objective: str) -> MILPProblem:
    S, N = R.shape
    G = class_m.shape[0]
    n = 2 * N + S + 1
    iw, iz, ix, ie = 0, N, 2 * N, 2 * N + S
    c = np.zeros(n)
    if objective == "return":
        c[iw:iw + N] = -mu_hat
    else:  # min CVaR
        c[ie] = 1.0
        c[ix:ix + S] = 1.0 / ((1 - p.cvar_level) * S)

    rows, rhs = [], []
    r = np.zeros(n); r[iz:iz + N] = 1; rows.append(r); rhs.append(p.max_assets)
    for i in range(N):
        r = np.zeros(n); r[iz + i] = p.min_weight; r[iw + i] = -1; rows.append(r); rhs.append(0.0)
        r = np.zeros(n); r[iw + i] = 1; r[iz + i] = -p.max_weight; rows.append(r); rhs.append(0.0)
    for g in range(G):
        r = np.zeros(n); r[iw:iw + N] = class_m[g]; rows.append(r); rhs.append(p.max_class_weight)
    ru = np.zeros((S, n))
    ru[:, iw:iw + N] = -R
    ru[:, ie] = -1.0
    ru[np.arange(S), ix + np.arange(S)] = -1.0
    A_ub = np.vstack([np.array(rows), ru])
    b_ub = np.concatenate([np.array(rhs), np.zeros(S)])
    if objective == "return":
        r = np.zeros(n); r[ie] = 1; r[ix:ix + S] = 1.0 / ((1 - p.cvar_level) * S)
        A_ub = np.vstack([A_ub, r]); b_ub = np.append(b_ub, p.cvar_cap)

    A_eq = np.zeros((1, n)); A_eq[0, iw:iw + N] = 1
    lb = np.zeros(n); lb[ie] = -np.inf
    ub = np.full(n, np.inf); ub[iw:iw + N] = 1; ub[iz:iz + N] = 1
    integ = np.zeros(n); integ[iz:iz + N] = 1
    return MILPProblem(c, A_ub, b_ub, A_eq, np.array([1.0]), lb, ub, integ)


def shrunk_means(R: np.ndarray, shrinkage: float) -> np.ndarray:
    mu = R.mean(axis=0)
    return (1 - shrinkage) * mu + shrinkage * mu.mean()


def solve_portfolio(R: np.ndarray, class_m: np.ndarray, p: MILPParams, prefer: str = "auto") -> MILPResult:
    """Solve the mean-CVaR MILP on the scenario matrix R (S months x N assets)."""
    S, N = R.shape
    mu_hat = shrunk_means(R, p.shrinkage)
    feasible = True
    try:
        sol = solve(_build(R, mu_hat, class_m, p, "return"), p.time_limit, prefer)
        if sol.status != "optimal" and sol.x is None:
            raise RuntimeError(sol.status)
    except RuntimeError:
        feasible = False
        sol = solve(_build(R, mu_hat, class_m, p, "cvar"), p.time_limit, prefer)

    x = sol.x
    w = np.clip(x[:N], 0, None)
    w[w < 1e-7] = 0
    w = w / w.sum()
    z = (x[N:2 * N] > 0.5).astype(int)
    eta = float(x[2 * N + S])
    xi = x[2 * N:2 * N + S]
    cvar = eta + xi.sum() / ((1 - p.cvar_level) * S)
    port = R @ w
    cvar_emp = empirical_cvar(port, p.cvar_level)
    return MILPResult(
        weights=w, selected=z,
        expected_return=float(port.mean()),
        expected_return_shrunk=float(mu_hat @ w),
        cvar=float(cvar), cvar_empirical=cvar_emp, var=eta,
        volatility=float(port.std(ddof=1)),
        cap_binding=bool(feasible and cvar_emp > p.cvar_cap - 1e-4),
        feasible_cap=feasible,
        solver=sol.solver, status=sol.status, seconds=sol.seconds,
    )
