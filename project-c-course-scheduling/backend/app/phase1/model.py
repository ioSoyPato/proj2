"""Phase 1 -- initial timetable MILP.

Decision: x[s,p,r,k] = 1 if section s is taught by professor p in room r with
meeting pattern k. Pre-filtering (equivalent to fixing x = 0) removes every
tuple that violates qualification, availability, capacity-vs-forecast or the
lab requirement, so those hard constraints hold by construction; the
remaining ones are explicit rows.

Objective: weighted count of violated SOFT preferences
  W_PREF  * section at a pattern the professor did not mark as preferred
  W_EDGE  * semester-1/3 cohort section in the 07:00 or 19:00 block
  W_PRIM  * professor teaching a course outside her primary courses
  W_LAB   * non-lab section occupying a computer lab
  W_SEAT  * empty seats relative to the forecast (room oversize)

Two solution strategies are implemented and both are reported:
* ``monolithic``  -- the full x[s,p,r,k] model (HiGHS; it exceeds Gurobi's
  2000-variable size-limited license).
* ``decomposed``  -- Stage A assigns professor + pattern y[s,p,k] with
  aggregate room-capacity counting constraints per pattern; Stage B assigns
  rooms z[s,r] given the patterns. If Stage B is infeasible for a pattern,
  a no-good cut on that pattern's section set is added to Stage A and it is
  re-solved (logic-based Benders). Each stage fits Gurobi's free license.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import numpy as np

from ..data.instance import Instance
from .solver import MilpModel, SolveResult

W_PREF, W_EDGE, W_PRIM, W_LAB, W_SEAT = 3.0, 2.0, 1.0, 1.0, 0.02
EDGE_BLOCKS = {0, 6}
WEIGHTS = {"pref": W_PREF, "edge": W_EDGE, "primary": W_PRIM, "lab": W_LAB, "seat": W_SEAT}


@dataclass
class Assignment:
    section: int
    prof: int
    room: int
    pattern: int


def room_ok(inst: Instance, s: int, r: int) -> bool:
    sec = inst.sections[s]
    room = inst.rooms[r]
    return room.capacity >= sec.forecast and (room.is_lab or not inst.courses[sec.course].lab)


def pk_cost(inst: Instance, s: int, p: int, k: int) -> float:
    sec = inst.sections[s]
    c = inst.courses[sec.course]
    prof = inst.profs[p]
    cost = 0.0
    if k not in prof.preferred:
        cost += W_PREF
    if c.semester <= 3 and inst.pattern_block(k) in EDGE_BLOCKS:
        cost += W_EDGE
    if sec.course not in prof.primary:
        cost += W_PRIM
    return cost


def room_cost(inst: Instance, s: int, r: int) -> float:
    sec = inst.sections[s]
    room = inst.rooms[r]
    cost = W_SEAT * (room.capacity - sec.forecast)
    if room.is_lab and not inst.courses[sec.course].lab:
        cost += W_LAB
    return cost


def breakdown(inst: Instance, a: list[Assignment]) -> dict:
    """Count of each violated preference + weighted total (independent of solver)."""
    out = {"pref": 0, "edge": 0, "primary": 0, "lab": 0, "seat": 0.0}
    for x in a:
        sec = inst.sections[x.section]
        prof = inst.profs[x.prof]
        c = inst.courses[sec.course]
        out["pref"] += int(x.pattern not in prof.preferred)
        out["edge"] += int(c.semester <= 3 and inst.pattern_block(x.pattern) in EDGE_BLOCKS)
        out["primary"] += int(sec.course not in prof.primary)
        out["lab"] += int(inst.rooms[x.room].is_lab and not c.lab)
        out["seat"] += inst.rooms[x.room].capacity - sec.forecast
    total = sum(WEIGHTS[k] * v for k, v in out.items())
    return {"counts": out, "weighted_total": total}


def _feasible_pk(inst: Instance):
    for s, sec in enumerate(inst.sections):
        for p, prof in enumerate(inst.profs):
            if sec.course not in prof.qualified:
                continue
            for k in range(inst.n_patterns):
                if k in prof.unavailable:
                    continue
                yield s, p, k


def _common_rows(inst: Instance, m: MilpModel, keys: list[tuple[int, int, int]], var_of: list[int]) -> None:
    """Assignment, professor clash, cohort clash, load limits on (s,p,k)-indexed vars."""
    by_s: dict[int, list[int]] = {}
    by_pk: dict[tuple[int, int], list[int]] = {}
    by_ck: dict[tuple[str, int], list[int]] = {}
    by_p: dict[int, list[int]] = {}
    for (s, p, k), v in zip(keys, var_of):
        by_s.setdefault(s, []).append(v)
        by_pk.setdefault((p, k), []).append(v)
        by_ck.setdefault((inst.sections[s].cohort, k), []).append(v)
        by_p.setdefault(p, []).append(v)
    for s in range(len(inst.sections)):
        vs = by_s.get(s, [])
        m.add_row(vs, [1] * len(vs), 1, 1)
    for vs in by_pk.values():
        if len(vs) > 1:
            m.add_row(vs, [1] * len(vs), -np.inf, 1)
    for vs in by_ck.values():
        if len(vs) > 1:
            m.add_row(vs, [1] * len(vs), -np.inf, 1)
    for p, prof in enumerate(inst.profs):
        vs = by_p.get(p, [])
        m.add_row(vs, [1] * len(vs), prof.min_sections, prof.max_sections)


# ---------------------------------------------------------------- monolithic
def solve_monolithic(inst: Instance, time_limit: float = 120.0, backend: str = "auto") -> tuple[list[Assignment], SolveResult]:
    m = MilpModel()
    keys4: list[tuple[int, int, int, int]] = []
    for s, p, k in _feasible_pk(inst):
        for r in range(len(inst.rooms)):
            if room_ok(inst, s, r):
                keys4.append((s, p, r, k))
                m.add_var(pk_cost(inst, s, p, k) + room_cost(inst, s, r))
    # (s,p,k) groupings reuse the common rows; each x var belongs to its (s,p,k)
    _common_rows(inst, m, [(s, p, k) for s, p, _, k in keys4], list(range(len(keys4))))
    by_rk: dict[tuple[int, int], list[int]] = {}
    for v, (s, p, r, k) in enumerate(keys4):
        by_rk.setdefault((r, k), []).append(v)
    for vs in by_rk.values():
        if len(vs) > 1:
            m.add_row(vs, [1] * len(vs), -np.inf, 1)
    res = m.solve(time_limit=time_limit, backend=backend)
    if res.x is None:
        return [], res
    sol = [Assignment(s, p, r, k) for v, (s, p, r, k) in enumerate(keys4) if res.x[v] > 0.5]
    return sol, res


# ---------------------------------------------------------------- decomposed
def _stage_b(inst: Instance, pattern_of: dict[int, int], backend: str) -> tuple[dict[int, int] | None, SolveResult, list[int] | None]:
    m = MilpModel()
    keys: list[tuple[int, int]] = []
    for s in pattern_of:
        for r in range(len(inst.rooms)):
            if room_ok(inst, s, r):
                keys.append((s, r))
                m.add_var(room_cost(inst, s, r))
    by_s: dict[int, list[int]] = {}
    by_rk: dict[tuple[int, int], list[int]] = {}
    for v, (s, r) in enumerate(keys):
        by_s.setdefault(s, []).append(v)
        by_rk.setdefault((r, pattern_of[s]), []).append(v)
    for s in pattern_of:
        vs = by_s.get(s, [])
        m.add_row(vs, [1] * len(vs), 1, 1)
    for vs in by_rk.values():
        if len(vs) > 1:
            m.add_row(vs, [1] * len(vs), -np.inf, 1)
    res = m.solve(time_limit=30, backend=backend)
    if res.x is None:
        # find a pattern whose section set cannot be roomed (check each pattern alone)
        for k in sorted(set(pattern_of.values())):
            sub = {s: kk for s, kk in pattern_of.items() if kk == k}
            sub_ok, _, _ = _stage_b_single(inst, sub)
            if not sub_ok:
                return None, res, sorted(sub)
        return None, res, sorted(pattern_of)
    return {s: r for v, (s, r) in enumerate(keys) if res.x[v] > 0.5}, res, None


def _stage_b_single(inst: Instance, sub: dict[int, int]) -> tuple[bool, None, None]:
    """Bipartite matching feasibility for one pattern (augmenting paths)."""
    match_r: dict[int, int] = {}

    def try_s(s: int, seen: set[int]) -> bool:
        for r in range(len(inst.rooms)):
            if room_ok(inst, s, r) and r not in seen:
                seen.add(r)
                if r not in match_r or try_s(match_r[r], seen):
                    match_r[r] = s
                    return True
        return False

    return all(try_s(s, set()) for s in sub), None, None


def solve_decomposed(inst: Instance, backend: str = "auto", max_iters: int = 20) -> tuple[list[Assignment], dict]:
    t0 = time.perf_counter()
    keys = list(_feasible_pk(inst))
    cuts: list[list[int]] = []
    stage_a_runs: list[dict] = []
    stage_b_res: SolveResult | None = None
    for it in range(max_iters):
        m = MilpModel()
        for s, p, k in keys:
            m.add_var(pk_cost(inst, s, p, k))
        _common_rows(inst, m, keys, list(range(len(keys))))
        # aggregate room-capacity counting constraints, per pattern
        thresholds = sorted({sec.forecast for sec in inst.sections})
        lab_secs = {s for s, sec in enumerate(inst.sections) if inst.courses[sec.course].lab}
        for k in range(inst.n_patterns):
            vk = [(v, s) for v, (s, _, kk) in enumerate(keys) if kk == k]
            for th in thresholds:
                n_rooms = sum(1 for r in inst.rooms if r.capacity >= th)
                vs = [v for v, s in vk if inst.sections[s].forecast >= th]
                if len(vs) > n_rooms:
                    m.add_row(vs, [1] * len(vs), -np.inf, n_rooms)
                n_labs = sum(1 for r in inst.rooms if r.is_lab and r.capacity >= th)
                vl = [v for v, s in vk if s in lab_secs and inst.sections[s].forecast >= th]
                if len(vl) > n_labs:
                    m.add_row(vl, [1] * len(vl), -np.inf, n_labs)
        for cut in cuts:  # no-good: this exact section set cannot share pattern k
            k, secs = cut[0], set(cut[1:])
            vs = [v for v, (s, _, kk) in enumerate(keys) if kk == k and s in secs]
            m.add_row(vs, [1] * len(vs), -np.inf, len(secs) - 1)
        res_a = m.solve(time_limit=60, backend=backend)
        stage_a_runs.append(res_a.as_dict())
        if res_a.x is None:
            return [], {"status": "infeasible", "stage_a": stage_a_runs, "seconds": time.perf_counter() - t0}
        chosen = [(s, p, k) for v, (s, p, k) in enumerate(keys) if res_a.x[v] > 0.5]
        pattern_of = {s: k for s, _, k in chosen}
        rooms, stage_b_res, bad = _stage_b(inst, pattern_of, backend)
        if rooms is not None:
            sol = [Assignment(s, p, rooms[s], k) for s, p, k in chosen]
            return sol, {"status": "optimal" if res_a.status == "optimal" else res_a.status,
                         "iterations": it + 1, "cuts": len(cuts), "stage_a": stage_a_runs,
                         "stage_b": stage_b_res.as_dict(), "seconds": time.perf_counter() - t0}
        k_bad = pattern_of[bad[0]]
        cuts.append([k_bad, *bad])
    return [], {"status": "no_convergence", "stage_a": stage_a_runs, "seconds": time.perf_counter() - t0}
