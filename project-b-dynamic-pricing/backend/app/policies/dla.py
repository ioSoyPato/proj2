"""Deterministic lookahead (DLA) — a rolling-horizon multiple-choice knapsack.

On day t, with state (R_t, d_t, r_t, belief about demand level), solve

    max_x   Σ_{τ=t}^{T-1} Σ_j  p_j · D̂_{τj} · x_{τj}
    s.t.    Σ_j x_{τj} = 1                    ∀τ      (one grid price per day)
            Σ_τ Σ_j D̂_{τj} x_{τj} ≤ R_t               (expected sales within remaining seats)
            x_{τj} ∈ {0, 1}

where D̂_{τj} = M̂_t · λ_τ · q(p_j, r̂_τ) is EXPECTED demand.  Only the price
for day t is applied; tomorrow the problem is re-solved from the new state.

Approximations (documented in the report):
1. Reference-price dynamics are non-linear in the decisions.  We fix r̂_τ along
   an incumbent price path (r̂_{τ+1} = θ r̂_τ + (1−θ) p̂_τ), solve the MILP, roll
   the reference forward along the new plan and re-solve — a successive
   approximation with at most ``iters`` rounds.  Among the iterates we keep the
   plan with the best *self-consistent* deterministic revenue.
2. The scarcity boost κ is ignored in the lookahead (conservative).
3. Demand level: M̂_t = (sold_t + n0) / (E[sold_t | M=1] + n0), a shrinkage
   estimate from observed vs expected sales (n0 = prior strength, tuned).
4. If even the highest grid price is expected to oversell, the knapsack is
   infeasible and the policy charges the top price (the only sensible action).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csr_matrix

from ..simulator.demand import purchase_prob, update_reference
from ..simulator.engine import State
from ..simulator.params import MarketParams
from .rules import nearest_index

# ---------------------------------------------------------------------------
# Solver backends
# ---------------------------------------------------------------------------
_GUROBI_STATE: dict = {"checked": False, "ok": False, "env": None, "reason": ""}


def _gurobi_env():
    """Create (once per process) a quiet Gurobi env; honours GRB_LICENSE_FILE."""
    st = _GUROBI_STATE
    if st["checked"]:
        return st["env"] if st["ok"] else None
    st["checked"] = True
    if os.environ.get("DLA_SOLVER", "auto").lower() == "highs":
        st["reason"] = "disabled by DLA_SOLVER=highs"
        return None
    try:
        from ..config import load_credentials
        load_credentials()  # puts GRB_LICENSE_FILE into the env if provided
        import gurobipy as gp
        env = gp.Env(empty=True)
        env.setParam("OutputFlag", 0)
        env.start()
        st.update(ok=True, env=env, reason="")
        return env
    except Exception as exc:  # no package / no licence / anything else -> HiGHS
        st.update(ok=False, env=None, reason=f"{type(exc).__name__}: {exc}"[:200])
        return None


def solver_info() -> dict:
    env = _gurobi_env()
    if env is not None:
        import gurobipy as gp
        lic = "GRB_LICENSE_FILE" if os.environ.get("GRB_LICENSE_FILE") else "restricted pip licence (size-limited)"
        return {"preferred": "gurobi", "version": ".".join(map(str, gp.gurobi.version())), "licence": lic,
                "fallback": "scipy.optimize.milp (HiGHS)"}
    import scipy
    return {"preferred": "highs", "version": f"scipy {scipy.__version__}", "licence": "open source (MIT)",
            "fallback": None, "gurobi_unavailable_reason": _GUROBI_STATE["reason"]}


MIP_GAP = 1e-3          # 0.1 % relative gap (measured: plans within 0.04 % of the 1e-4-gap optimum)
TIME_LIMIT = 5.0        # seconds per solve (never binding in practice)


def _flat(cols: list[np.ndarray], val: np.ndarray, wt: np.ndarray):
    rows = np.concatenate([np.full(len(c), h) for h, c in enumerate(cols)])
    cidx = np.concatenate(cols)
    return rows, cidx, val[rows, cidx], wt[rows, cidx]


def _solve_gurobi(env, cols, val, wt, cap):
    import gurobipy as gp
    H = len(cols)
    rows, cidx, v, w = _flat(cols, val, wt)
    n = len(v)
    with gp.Model(env=env) as m:
        x = m.addMVar(n, vtype=gp.GRB.BINARY)
        A = csr_matrix((np.ones(n), (rows, np.arange(n))), shape=(H, n))
        m.addMConstr(A, x, "=", np.ones(H))
        m.addMConstr(csr_matrix(w.reshape(1, n)), x, "<", np.array([cap]))
        m.setObjective(v @ x, gp.GRB.MAXIMIZE)
        m.Params.MIPGap = MIP_GAP
        m.Params.TimeLimit = TIME_LIMIT
        m.Params.Threads = 1
        m.optimize()
        if m.SolCount == 0:
            return None
        xs = np.asarray(x.X) > 0.5
    return _unflat(rows, cidx, xs, H)


def _unflat(rows, cidx, xs, H):
    out = np.empty(H, dtype=np.int64)
    out[rows[xs]] = cidx[xs]
    return out


def _solve_highs(cols, val, wt, cap):
    H = len(cols)
    rows, cidx, v, w = _flat(cols, val, wt)
    n = len(v)
    A_eq = csr_matrix((np.ones(n), (rows, np.arange(n))), shape=(H, n))
    A_cap = csr_matrix(w.reshape(1, n))
    res = milp(c=-v, integrality=np.ones(n), bounds=Bounds(0, 1),
               constraints=[LinearConstraint(A_eq, 1, 1), LinearConstraint(A_cap, -np.inf, cap)],
               options={"mip_rel_gap": MIP_GAP, "time_limit": TIME_LIMIT})
    if res.x is None:
        return None
    return _unflat(rows, cidx, res.x > 0.5, H)


def undominated(val_row: np.ndarray, wt_row: np.ndarray) -> np.ndarray:
    """Columns not dominated by another one with ≤ weight and ≥ value (exact pruning)."""
    order = np.lexsort((-val_row, wt_row))           # by weight asc, then value desc
    keep, best = [], -np.inf
    for j in order:
        if val_row[j] > best + 1e-9:
            keep.append(j)
            best = val_row[j]
    return np.array(sorted(keep), dtype=np.int64)


SOLVE_COUNTS: dict[str, int] = {"gurobi": 0, "highs": 0, "infeasible": 0}


def solve_mckp(val: np.ndarray, wt: np.ndarray, cap: float) -> np.ndarray:
    """Pick one column per row maximising Σ val subject to Σ wt ≤ cap (MILP)."""
    if wt.min(axis=1).sum() > cap:           # infeasible: even the top price oversells
        SOLVE_COUNTS["infeasible"] += 1
        return wt.argmin(axis=1)
    cols = [undominated(val[h], wt[h]) for h in range(val.shape[0])]
    if all(len(c) == 1 for c in cols):
        return np.array([c[0] for c in cols])
    env = _gurobi_env()
    if env is not None:
        try:
            sol = _solve_gurobi(env, cols, val, wt, cap)
            if sol is not None:
                SOLVE_COUNTS["gurobi"] += 1
                return sol
        except Exception:
            _GUROBI_STATE["size_fallbacks"] = _GUROBI_STATE.get("size_fallbacks", 0) + 1
    sol = _solve_highs(cols, val, wt, cap)
    SOLVE_COUNTS["highs"] += 1
    if sol is None:
        return wt.argmin(axis=1)
    return sol


# ---------------------------------------------------------------------------
# The policy
# ---------------------------------------------------------------------------
def ref_path(r0: float, prices: np.ndarray, theta: float) -> np.ndarray:
    """Reference price at the start of each planned day."""
    r = np.empty(len(prices))
    cur = r0
    for i, p in enumerate(prices):
        r[i] = cur
        cur = float(update_reference(cur, p, theta))
    return r


def deterministic_revenue(prices: np.ndarray, r0: float, lam: np.ndarray, seats: float,
                          params: MarketParams) -> float:
    """Self-consistent fluid revenue of a price path (reference rolled along the path)."""
    r = ref_path(r0, prices, params.theta)
    d = lam * purchase_prob(prices, r, params.eta, params.gamma, params.wtp_mu, params.wtp_sigma)
    rem, rev = seats, 0.0
    for p, dem in zip(prices, d):
        s = min(dem, rem)
        rev += p * s
        rem -= s
    return rev


def make_blocks(H: int, fine_days: int, block_len: int) -> list[tuple[int, int]]:
    """Temporal aggregation of the lookahead: the next ``fine_days`` days are
    priced individually, later days in blocks of ``block_len`` days sharing one
    price (Powell: an aggregated lookahead model).  Returns [start, end) pairs."""
    out, i = [], 0
    while i < H:
        L = 1 if i < fine_days else block_len
        out.append((i, min(H, i + L)))
        i += L
    return out


@dataclass
class Lookahead:
    """DLA.  Tunable: ``prior_n0`` (belief strength in tickets); structural:
    ``iters`` (successive-approximation rounds), ``fine_days``/``block_len``."""
    prior_n0: float = 300.0
    iters: int = 3
    fine_days: int = 7
    block_len: int = 5
    name: str = "dla"
    _cache: dict = field(default_factory=dict, repr=False)

    def reset(self, params: MarketParams, n: int) -> None:
        self._lam = params.arrival_rates()
        self._grid = params.grid
        self._cache = {}
        self._last: list[np.ndarray | None] = [None] * n

    def belief(self, sold: float, exp_sold: float) -> float:
        if not np.isfinite(self.prior_n0):
            return 1.0
        return float((sold + self.prior_n0) / (exp_sold + self.prior_n0))

    def _block_demand(self, blocks, lam, r_start, params):
        """D̂[b, j]: expected demand of block b if price j is held through it,
        with the reference rolling from its block-start value r_start[b]."""
        grid, th = self._grid, params.theta
        D = np.zeros((len(blocks), len(grid)))
        for b, (a, e) in enumerate(blocks):
            k = np.arange(e - a)[:, None]
            r = grid[None, :] + (r_start[b] - grid[None, :]) * th ** k     # (L, J)
            q = purchase_prob(grid[None, :], r, params.eta, params.gamma, params.wtp_mu, params.wtp_sigma)
            D[b] = (lam[a:e, None] * q).sum(axis=0)
        return D

    def plan(self, t: int, seats: float, ref: float, m_hat: float, params: MarketParams,
             warm: np.ndarray | None = None) -> np.ndarray:
        """Full price plan (grid indices, one per remaining day) for days t..T-1.
        ``warm`` = yesterday's plan shifted by one day (used as first incumbent)."""
        key = (t, int(seats), round(float(ref), 3), round(m_hat, 4))
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        grid, lam = self._grid, self._lam[t:] * m_hat
        H = len(lam)
        if seats <= 0:
            plan = np.full(H, len(grid) - 1)
            self._cache[key] = plan
            return plan
        blocks = make_blocks(H, self.fine_days, self.block_len)
        starts = np.array([a for a, _ in blocks])
        if warm is not None and len(warm) == H:
            inc = warm.copy()
        else:
            inc = np.full(H, int(nearest_index(grid, ref)))
        best, best_val = inc, -np.inf
        for _ in range(max(1, self.iters)):
            r_hat = ref_path(ref, grid[inc], params.theta)
            D = self._block_demand(blocks, lam, r_hat[starts], params)
            sol_b = solve_mckp(grid[None, :] * D, D, float(seats))
            sol = np.concatenate([np.full(e - a, sol_b[b]) for b, (a, e) in enumerate(blocks)])
            v = deterministic_revenue(grid[sol], ref, lam, seats, params)
            if v > best_val:
                best, best_val = sol, v
            if np.array_equal(sol, inc):
                break
            inc = sol
        self._cache[key] = best
        return best

    def act(self, state: State, params: MarketParams) -> np.ndarray:
        out = np.empty(state.seats.shape[0], dtype=np.int64)
        for i in range(out.shape[0]):
            m_hat = self.belief(float(state.sold[i]), float(state.exp_sold[i]))
            prev = self._last[i]
            warm = prev[1:] if prev is not None and len(prev) > 1 else None
            pl = self.plan(state.t, float(state.seats[i]), float(state.ref[i]), m_hat, params, warm)
            self._last[i] = pl
            out[i] = pl[0]
        return out
