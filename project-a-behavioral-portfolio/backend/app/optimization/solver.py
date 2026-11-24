"""A tiny MILP solver abstraction: Gurobi if importable and licensed, else HiGHS.

Problems are stated once in matrix form::

    min  c^T x   s.t.  A_ub x <= b_ub,  A_eq x = b_eq,  lb <= x <= ub,
                       x_j integer for integrality[j] == 1

and handed to whichever backend is available. ``scipy.optimize.milp``
(HiGHS) is always available; ``gurobipy`` is used when it imports AND a
licence (the size-limited pip licence or ``GRB_LICENSE_FILE`` from
``credentials.env``) lets it build and solve a model.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp

from .. import config  # noqa: F401  (loads credentials.env before gurobipy is imported)


@dataclass
class MILPProblem:
    c: np.ndarray
    A_ub: np.ndarray
    b_ub: np.ndarray
    A_eq: np.ndarray
    b_eq: np.ndarray
    lb: np.ndarray
    ub: np.ndarray
    integrality: np.ndarray


@dataclass
class MILPSolution:
    x: np.ndarray
    objective: float
    status: str
    solver: str
    seconds: float


@lru_cache(maxsize=1)
def gurobi_status() -> dict:
    """Probe gurobipy once. Never raises; returns {'available': bool, 'reason': str, 'license': str}."""
    if os.environ.get("FORCE_HIGHS") == "1":
        return {"available": False, "reason": "FORCE_HIGHS=1", "license": "none"}
    try:
        import gurobipy as gp  # type: ignore

        env = gp.Env(params={"OutputFlag": 0})
        m = gp.Model(env=env)
        x = m.addVar(vtype=gp.GRB.BINARY)
        m.setObjective(x, gp.GRB.MAXIMIZE)
        m.optimize()
        lic = "GRB_LICENSE_FILE (credentials.env)" if os.environ.get("GRB_LICENSE_FILE") else "pip size-limited licence"
        m.dispose()
        env.dispose()
        return {"available": True, "reason": f"gurobipy {gp.gurobi.version()}", "license": lic}
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "reason": f"{type(exc).__name__}: {exc}"[:200], "license": "none"}


def _solve_highs(p: MILPProblem, time_limit: float) -> MILPSolution:
    t0 = time.perf_counter()
    cons = []
    if p.A_ub.size:
        cons.append(LinearConstraint(p.A_ub, -np.inf, p.b_ub))
    if p.A_eq.size:
        cons.append(LinearConstraint(p.A_eq, p.b_eq, p.b_eq))
    res = milp(
        c=p.c, constraints=cons, integrality=p.integrality, bounds=Bounds(p.lb, p.ub),
        options={"time_limit": time_limit, "mip_rel_gap": 1e-6, "disp": False},
    )
    if res.x is None:
        raise RuntimeError(f"HiGHS failed: {res.message}")
    return MILPSolution(np.asarray(res.x), float(res.fun), "optimal" if res.status == 0 else str(res.message),
                        "HiGHS (scipy.optimize.milp)", time.perf_counter() - t0)


_GRB_ENV = None


def _solve_gurobi(p: MILPProblem, time_limit: float) -> MILPSolution:
    import gurobipy as gp  # type: ignore

    global _GRB_ENV
    if _GRB_ENV is None:
        _GRB_ENV = gp.Env(params={"OutputFlag": 0, "Threads": 1})
    t0 = time.perf_counter()
    m = gp.Model(env=_GRB_ENV)
    m.Params.TimeLimit = time_limit
    m.Params.MIPGap = 1e-6
    vtype = np.where(p.integrality > 0, gp.GRB.BINARY, gp.GRB.CONTINUOUS)
    x = m.addMVar(p.c.shape[0], lb=p.lb, ub=p.ub, vtype=vtype)
    m.setObjective(p.c @ x, gp.GRB.MINIMIZE)
    if p.A_ub.size:
        m.addConstr(p.A_ub @ x <= p.b_ub)
    if p.A_eq.size:
        m.addConstr(p.A_eq @ x == p.b_eq)
    m.optimize()
    if m.SolCount == 0:
        raise RuntimeError(f"Gurobi status {m.Status}")
    sol = MILPSolution(np.asarray(x.X), float(m.ObjVal),
                       "optimal" if m.Status == gp.GRB.OPTIMAL else f"status {m.Status}",
                       f"Gurobi ({gurobi_status()['reason']})", time.perf_counter() - t0)
    m.dispose()
    return sol


def solve(p: MILPProblem, time_limit: float = 20.0, prefer: str = "auto") -> MILPSolution:
    """Solve with Gurobi when available (``prefer='auto'|'gurobi'``), else HiGHS."""
    if prefer in ("auto", "gurobi") and gurobi_status()["available"]:
        try:
            return _solve_gurobi(p, time_limit)
        except Exception:  # noqa: BLE001 - e.g. model too large for the size-limited licence
            pass
    return _solve_highs(p, time_limit)


def active_solver_name() -> str:
    st = gurobi_status()
    return f"Gurobi ({st['reason']}, {st['license']})" if st["available"] else "HiGHS (scipy.optimize.milp)"
