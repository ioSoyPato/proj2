"""Correctness checks: Phase-1 feasibility, CRN, seed separation, DLA execution, adjunct lead time."""
from __future__ import annotations

import numpy as np
import pytest

from app.config import EVAL_SEED_BASE, TRAIN_SEED_BASE, TUNE_SEED_BASE
from app.data.instance import load_instance
from app.evaluation.evaluate import eval_seeds, run_one, tuning_seeds
from app.phase1.checker import check_timetable
from app.phase1.model import solve_decomposed, solve_monolithic
from app.phase1.run import get_timetable
from app.policies import POLICY_ORDER, make_policy
from app.policies.dla import WeeklyReoptimization
from app.simulator.env import Action, RegistrationEnv
from app.simulator.params import N_WEEKS, Settings
from app.simulator.scenario import make_scenario

INST = load_instance()
S = Settings()


# ------------------------------------------------------------------ data shape
def test_instance_matches_spec():
    assert len(INST.courses) == 25
    assert {c.semester for c in INST.courses} == {1, 3, 5, 7}
    assert len(INST.sections) == 37
    assert len(INST.cohorts) == 6
    assert len(INST.profs) == 14
    assert len(INST.adjuncts) == 5 and all(a.lead_time == 2 for a in INST.adjuncts)
    assert len(INST.rooms) == 10 and any(r.is_lab for r in INST.rooms)
    assert INST.n_patterns == 14
    assert INST.history.groupby("course").year.nunique().eq(5).all()


# ------------------------------------------------------------------ phase 1
def test_monolithic_solution_is_feasible():
    sol, res = solve_monolithic(INST)
    assert res.status == "optimal"
    assert check_timetable(INST, [a.__dict__ for a in sol]) == []


def test_decomposed_solution_is_feasible():
    sol, info = solve_decomposed(INST)
    assert info["status"] in ("optimal", "time_limit")
    assert check_timetable(INST, [a.__dict__ for a in sol]) == []


def test_checker_catches_violations():
    rows = [dict(r) for r in get_timetable()]
    assert check_timetable(INST, rows) == []
    bad = [dict(r) for r in rows]
    bad[1]["pattern"] = bad[0]["pattern"]; bad[1]["room"] = bad[0]["room"]   # room clash
    assert any("double-booked" in v for v in check_timetable(INST, bad))
    bad = [dict(r) for r in rows]
    lab_sec = next(i for i, r in enumerate(rows) if INST.courses[INST.sections[r["section"]].course].lab)
    bad[lab_sec]["room"] = next(r.idx for r in INST.rooms if not r.is_lab)
    assert any("non-lab" in v for v in check_timetable(INST, bad))
    assert any("assigned 0 times" in v for v in check_timetable(INST, rows[1:]))


# ------------------------------------------------------------------ CRN + seeds
def test_crn_identical_across_policies():
    seed = EVAL_SEED_BASE + 3
    fps = {name: run_one((name, {}), seed, S)["fingerprint"] for name in POLICY_ORDER}
    assert len(set(fps.values())) == 1
    # and the exogenous draws do not depend on anything but the seed
    a, b = make_scenario(INST, seed, S.scen), make_scenario(INST, seed, S.scen)
    assert a.fingerprint() == b.fingerprint()
    assert make_scenario(INST, seed + 1, S.scen).fingerprint() != a.fingerprint()


def test_policies_do_not_change_exogenous_information():
    seed = EVAL_SEED_BASE + 5
    demand = {}
    for name in POLICY_ORDER:
        scn = make_scenario(INST, seed, S.scen)
        env = RegistrationEnv(INST, get_timetable(), scn, S)
        out = env.run(make_policy(name))
        demand[name] = (out["demand"], int(env.requests.sum()), scn.unavail_week.tolist())
    assert len({str(v) for v in demand.values()}) == 1


def test_seed_families_are_disjoint():
    train = set(range(TRAIN_SEED_BASE, TRAIN_SEED_BASE + 100_000))
    tune = set(tuning_seeds(1000))
    ev = set(eval_seeds(1000))
    assert not (train & tune) and not (train & ev) and not (tune & ev)
    assert min(ev) > max(tune) and min(tune) > TRAIN_SEED_BASE + 15_000


# ------------------------------------------------------------------ DLA
def test_dla_applies_only_current_week_decisions():
    """Wrap decide(): every action executed at week t comes from the tau == t part of the MILP
    solution; decisions the lookahead planned for tau > t are never executed in week t."""
    futures: list[int] = []
    for seed in (EVAL_SEED_BASE + i for i in range(8)):
        env = RegistrationEnv(INST, get_timetable(), make_scenario(INST, seed, S.scen), S)
        pol = WeeklyReoptimization(theta=1.2)
        orig = pol.decide

        def wrapped(e, _orig=orig, _pol=pol):
            before = len(e.actions_log)
            out = _orig(e)
            new = e.actions_log[before:]
            assert all(t == e.t for t, _ in new)
            if e.t < N_WEEKS and _pol.last_plan_summary and _pol.last_plan_summary.get("status") == "optimal":
                applied = [a for _, a in _pol.last_applied]
                assert all(a in applied for _, a in new), "executed something not in this week's decisions"
                futures.append(len(_pol.last_future))
                for tau, fut in _pol.last_future:
                    assert tau > e.t
                    if fut.kind == "open":
                        assert fut not in [a for _, a in new], "a future-week decision was executed now"
            return out

        pol.decide = wrapped
        env.run(pol)
    # the lookahead really does plan beyond the current week in some epochs (so the test is not vacuous)
    assert sum(futures) > 0


# ------------------------------------------------------------------ adjunct lead time
def test_adjunct_lead_time_enforced():
    env = RegistrationEnv(INST, get_timetable(), make_scenario(INST, EVAL_SEED_BASE, S.scen), S)
    env.t = 1
    a = 0
    adj = INST.adjuncts[a]
    c = next(iter(adj.qualified))
    k = next(iter(adj.available))
    r = next(r.idx for r in INST.rooms if env.room_ok(r.idx, c, k))
    # not hired -> cannot open
    assert env.check(Action("open", course=c, instr_kind="adj", instr=a, room=r, pattern=k)) is not None
    env.apply(Action("hire", instr=a))
    assert env.adj_arrival(a) == 1 + adj.lead_time
    # hired at week 1: the section is created but only seats students from week 3
    env.apply(Action("open", course=c, instr_kind="adj", instr=a, room=r, pattern=k))
    sec = env.sections[-1]
    assert sec.status == "planned" and sec.active_from == 3
    # an orphan cannot be given to an adjunct who has not arrived
    orphan = env.sections[0]
    orphan.instr_kind, orphan.instr = "", -1
    assert env.check(Action("assign", section=0, instr_kind="adj", instr=a)) is not None
    # hiring at week 4 cannot staff a new section (arrives at week 6 = after registration)
    env2 = RegistrationEnv(INST, get_timetable(), make_scenario(INST, EVAL_SEED_BASE, S.scen), S)
    env2.t = 4
    env2.apply(Action("hire", instr=a))
    assert env2.check(Action("open", course=c, instr_kind="adj", instr=a, room=r, pattern=k)) is not None


def test_planned_section_seats_nobody_before_arrival():
    for seed in (EVAL_SEED_BASE + i for i in range(20)):
        env = RegistrationEnv(INST, get_timetable(), make_scenario(INST, seed, S.scen), S, record=True)
        env.run(make_policy("rl"))
        for wk in env.log.weeks:
            for s in wk["after"]["sections"]:
                if s["instr_kind"] == "adj" and s["active_from"] > wk["week"]:
                    assert s["enrolled"] == 0


# ------------------------------------------------------------------ accounting
def test_cost_accounting_and_conservation():
    for name in POLICY_ORDER:
        scn = make_scenario(INST, EVAL_SEED_BASE + 7, S.scen)
        env = RegistrationEnv(INST, get_timetable(), scn, S)
        out = env.run(make_policy(name))
        parts = (out["instructor_cost"] + out["adjunct_fees"] + out["room_cost"] + out["move_admin"]
                 + out["unserved_penalty"] + out["change_penalty"])
        assert out["total_cost"] == pytest.approx(parts)
        # every student ends enrolled, dropped or unserved
        n_enrolled = sum(s.enrolled for s in env.sections if s.status != "cancelled")
        n_dropped = sum(int(np.sum(st == -4)) for st in env.status)
        assert n_enrolled + n_dropped + out["unserved"] == out["demand"]
        assert out["budget_left"] >= -1e-6
