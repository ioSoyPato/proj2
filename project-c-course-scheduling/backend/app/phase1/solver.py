"""Tiny solver-agnostic MILP builder: Gurobi (if usable) or HiGHS via scipy.

Gurobi's pip wheel ships a size-limited license (<= 2000 variables and
<= 2000 linear constraints). With ``GRB_LICENSE_FILE`` set in credentials.env
the limit disappears. ``backend="auto"`` therefore picks Gurobi only when it
can actually solve the model, and HiGHS otherwise; the result reports which
solver really ran.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csr_array

from ..config import GUROBI_FULL_LICENSE

try:  # pragma: no cover - depends on environment
    import gurobipy as gp

    HAVE_GUROBI = True
except Exception:  # noqa: BLE001
    gp = None
    HAVE_GUROBI = False

RESTRICTED_LIMIT = 2000


@dataclass
class SolveResult:
    status: str            # "optimal" | "time_limit" | "infeasible" | "error"
    x: np.ndarray | None
    objective: float | None
    bound: float | None
    gap: float | None
    solver: str
    seconds: float
    n_vars: int
    n_cons: int
    n_binary: int
    note: str = ""

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if k != "x"}


@dataclass
class MilpModel:
    c: list[float] = field(default_factory=list)
    lb: list[float] = field(default_factory=list)
    ub: list[float] = field(default_factory=list)
    integer: list[bool] = field(default_factory=list)
    rows_i: list[int] = field(default_factory=list)
    rows_j: list[int] = field(default_factory=list)
    rows_v: list[float] = field(default_factory=list)
    row_lb: list[float] = field(default_factory=list)
    row_ub: list[float] = field(default_factory=list)
    obj_const: float = 0.0

    def add_var(self, cost: float = 0.0, lb: float = 0.0, ub: float = 1.0, integer: bool = True) -> int:
        self.c.append(float(cost)); self.lb.append(lb); self.ub.append(ub); self.integer.append(integer)
        return len(self.c) - 1

    def add_row(self, idx: list[int], coef: list[float], lb: float = -np.inf, ub: float = np.inf) -> int:
        r = len(self.row_lb)
        for j, v in zip(idx, coef):
            if v != 0:
                self.rows_i.append(r); self.rows_j.append(j); self.rows_v.append(float(v))
        self.row_lb.append(lb); self.row_ub.append(ub)
        return r

    @property
    def n_vars(self) -> int:
        return len(self.c)

    @property
    def n_cons(self) -> int:
        return len(self.row_lb)

    # ------------------------------------------------------------------ solve
    def solve(self, time_limit: float = 60.0, mip_gap: float = 1e-4, backend: str = "auto") -> SolveResult:
        if self.n_vars == 0:
            return SolveResult("optimal", np.zeros(0), self.obj_const, self.obj_const, 0.0, "trivial (no variables)",
                               0.0, 0, self.n_cons, 0)
        use_grb = False
        note = ""
        if backend in ("auto", "gurobi") and HAVE_GUROBI:
            fits = self.n_vars <= RESTRICTED_LIMIT and self.n_cons <= RESTRICTED_LIMIT
            use_grb = GUROBI_FULL_LICENSE or fits
            if not use_grb:
                note = (f"model has {self.n_vars} vars / {self.n_cons} constraints > Gurobi size-limited "
                        f"license ({RESTRICTED_LIMIT}); used HiGHS")
        elif backend == "gurobi":
            note = "gurobipy not installed; used HiGHS"
        if use_grb:
            try:
                return self._solve_gurobi(time_limit, mip_gap)
            except Exception as e:  # noqa: BLE001 - license/size errors -> fallback
                note = f"Gurobi failed ({type(e).__name__}: {str(e)[:120]}); used HiGHS"
        res = self._solve_highs(time_limit, mip_gap)
        res.note = note
        return res

    def _A(self) -> csr_array:
        return csr_array((self.rows_v, (self.rows_i, self.rows_j)), shape=(self.n_cons, self.n_vars))

    def _solve_highs(self, time_limit: float, mip_gap: float) -> SolveResult:
        t0 = time.perf_counter()
        cons = [LinearConstraint(self._A(), np.array(self.row_lb), np.array(self.row_ub))] if self.n_cons else []
        res = milp(np.array(self.c), constraints=cons, integrality=np.array(self.integer, dtype=int),
                   bounds=Bounds(np.array(self.lb), np.array(self.ub)),
                   options={"time_limit": time_limit, "mip_rel_gap": mip_gap, "disp": False})
        dt = time.perf_counter() - t0
        status = {0: "optimal", 1: "time_limit", 2: "infeasible", 3: "unbounded"}.get(res.status, "error")
        x = res.x if res.x is not None else None
        obj = float(res.fun) + self.obj_const if res.fun is not None else None
        bound = getattr(res, "mip_dual_bound", None)
        gap = getattr(res, "mip_gap", None)
        if status == "time_limit" and x is None:
            status = "error"
        return SolveResult(status, x, obj, (float(bound) + self.obj_const) if bound is not None else None,
                           float(gap) if gap is not None else (0.0 if status == "optimal" else None),
                           "HiGHS (scipy.optimize.milp)", dt, self.n_vars, self.n_cons, int(sum(self.integer)))

    def _solve_gurobi(self, time_limit: float, mip_gap: float) -> SolveResult:  # pragma: no cover
        t0 = time.perf_counter()
        env = gp.Env(empty=True)
        env.setParam("OutputFlag", 0)
        env.start()
        m = gp.Model(env=env)
        m.Params.TimeLimit = time_limit
        m.Params.MIPGap = mip_gap
        vt = [gp.GRB.BINARY if (i and lo == 0 and hi == 1) else (gp.GRB.INTEGER if i else gp.GRB.CONTINUOUS)
              for i, lo, hi in zip(self.integer, self.lb, self.ub)]
        xs = m.addMVar(self.n_vars, lb=np.array(self.lb), ub=np.array(self.ub), vtype=vt, obj=np.array(self.c))
        if self.n_cons:
            A = self._A()
            lb = np.array(self.row_lb); ub = np.array(self.row_ub)
            eq = lb == ub
            if eq.any():
                m.addMConstr(A[eq], xs, "=", ub[eq])
            le = (~eq) & np.isfinite(ub)
            if le.any():
                m.addMConstr(A[le], xs, "<", ub[le])
            ge = (~eq) & np.isfinite(lb)
            if ge.any():
                m.addMConstr(A[ge], xs, ">", lb[ge])
        m.optimize()
        dt = time.perf_counter() - t0
        st = m.Status
        if m.SolCount == 0:
            return SolveResult("infeasible" if st == gp.GRB.INFEASIBLE else "error", None, None, None, None,
                               f"Gurobi {'.'.join(map(str, gp.gurobi.version()))}", dt, self.n_vars, self.n_cons,
                               int(sum(self.integer)))
        status = "optimal" if st == gp.GRB.OPTIMAL else "time_limit"
        x = np.array(xs.X)
        lic = "full license" if GUROBI_FULL_LICENSE else "size-limited pip license"
        return SolveResult(status, x, float(m.ObjVal) + self.obj_const, float(m.ObjBound) + self.obj_const,
                           float(m.MIPGap), f"Gurobi {'.'.join(map(str, gp.gurobi.version()))} ({lic})", dt,
                           self.n_vars, self.n_cons, int(sum(self.integer)))
