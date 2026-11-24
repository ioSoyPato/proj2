"""Shared building blocks for policies: demand belief, staffing options, orphan cover."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..simulator.env import Action, RegistrationEnv
from ..simulator.params import ARRIVAL_PROFILE, N_WEEKS

PRIOR_CV = 0.25  # department's prior uncertainty on its own forecast (coefficient of variation)


class Policy:
    name = "policy"
    label = "Policy"
    policy_class = ""

    def reset(self, env: RegistrationEnv) -> None:  # noqa: D401 - interface
        self.last_plan_summary = None

    def decide(self, env: RegistrationEnv) -> list[Action]:
        raise NotImplementedError

    def params(self) -> dict:
        return {}


def posterior_total(env: RegistrationEnv) -> np.ndarray:
    """Gamma-Poisson posterior mean of each course's total demand rate.

    Prior Lambda_c ~ Gamma(a, b) with mean = Phase-1 forecast F_c and CV PRIOR_CV.
    Observed R_c requests in weeks < t ~ Poisson(Lambda_c * pi_t), pi_t = cumulative
    arrival share. Posterior mean = (a + R_c) / (b + pi_t).
    """
    a = 1.0 / PRIOR_CV**2
    F = np.array([c.forecast for c in env.inst.courses])
    b = a / F
    pi = float(sum(ARRIVAL_PROFILE[: min(env.t, N_WEEKS)]))
    return (a + env.observed_requests()) / (b + pi)


def remaining_by_week(env: RegistrationEnv, theta: float = 1.0) -> np.ndarray:
    """(n_courses, N_WEEKS) expected requests still to come in each week >= t (zero before t)."""
    lam = posterior_total(env) * theta
    out = np.zeros((env.n_courses, N_WEEKS))
    for w in range(env.t, N_WEEKS):
        out[:, w] = lam * ARRIVAL_PROFILE[w]
    return out


def clash(env: RegistrationEnv, c: int, k: int) -> int:
    """# cohorts of course c's semester that already have a class at pattern k (soft)."""
    sem = env.inst.courses[c].semester
    return sum(1 for s in env.sections if s.status in ("active", "planned") and s.cohort != "X"
               and env.inst.courses[s.course].semester == sem and s.pattern == k)


@dataclass
class OpenOption:
    instr_kind: str
    instr: int
    room: int
    pattern: int
    capacity: int
    cost: float
    clash: int
    needs_hire: bool = False


def open_options(env: RegistrationEnv, c: int, kinds: tuple[str, ...] = ("ft", "adj"),
                 allow_hire: bool = True) -> list[OpenOption]:
    """All feasible (instructor, room, pattern) combos to open a new section of course c now."""
    inst, cp = env.inst, env.S.cost
    t = env.t
    out: list[OpenOption] = []
    rooms_by_k = {k: [r for r in range(len(inst.rooms)) if env.room_ok(r, c, k)] for k in range(inst.n_patterns)}
    if "ft" in kinds:
        for p in range(len(inst.profs)):
            for k in range(inst.n_patterns):
                if rooms_by_k[k] and env.ft_can_teach(p, c, k):
                    for r in rooms_by_k[k]:
                        cap = inst.rooms[r].capacity
                        out.append(OpenOption("ft", p, r, k, cap, cp.ft_section_cost + cp.room_cost(cap), clash(env, c, k)))
    if "adj" in kinds:
        for a, adj in enumerate(inst.adjuncts):
            hired = env.adj_hired_week[a] >= 0
            if not hired and (not allow_hire or t + adj.lead_time > N_WEEKS - 1):
                continue
            if hired and max(t, env.adj_arrival(a)) > N_WEEKS - 1:
                continue
            if c not in adj.qualified or env.adj_load[a] >= adj.max_sections:
                continue
            for k in adj.available:
                if (a, k) in env.adj_busy:
                    continue
                for r in rooms_by_k[k]:
                    cap = inst.rooms[r].capacity
                    out.append(OpenOption("adj", a, r, k, cap,
                                          adj.cost_per_section + cp.room_cost(cap) + (0 if hired else cp.adjunct_hire_fee),
                                          clash(env, c, k), needs_hire=not hired))
    return out


def execute_open(env: RegistrationEnv, c: int, o: OpenOption) -> bool:
    if o.needs_hire:
        if env.budget < env.S.cost.adjunct_hire_fee + env.adj_section_cost(o.instr):
            return False
        if not env.apply(Action("hire", course=c, instr=o.instr), strict=False):
            return False
    return env.apply(Action("open", course=c, instr_kind=o.instr_kind, instr=o.instr, room=o.room,
                            pattern=o.pattern), strict=False)


def pick_option(opts: list[OpenOption], need: float) -> OpenOption | None:
    """Cheapest option whose room covers `need`; otherwise the largest room.

    Ties broken by fewer cohort clashes, then by cost.
    """
    if not opts:
        return None
    fit = [o for o in opts if o.capacity >= need]
    if fit:
        return min(fit, key=lambda o: (o.cost, o.clash, o.capacity))
    return max(opts, key=lambda o: (o.capacity, -o.clash, -o.cost))


def reschedule_options(env: RegistrationEnv, s, kinds: tuple[str, ...] = ("ft", "adj"),
                       arrived_only: bool = True) -> list[OpenOption]:
    """New (instructor, room, pattern) for orphaned section s at a DIFFERENT time if needed."""
    inst, cp, c = env.inst, env.S.cost, s.course
    out: list[OpenOption] = []
    rooms_by_k = {k: [r for r in range(len(inst.rooms)) if env.room_ok(r, c, k)
                      and inst.rooms[r].capacity >= max(s.enrolled, 1)] for k in range(inst.n_patterns)}
    # its own room is still booked by the section itself, so it is available at its own pattern
    rooms_by_k[s.pattern] = sorted(set(rooms_by_k[s.pattern]) | {s.room})
    if "ft" in kinds:
        for p in range(len(inst.profs)):
            for k in range(inst.n_patterns):
                if env.ft_can_teach(p, c, k):
                    for r in rooms_by_k[k]:
                        cap = inst.rooms[r].capacity
                        out.append(OpenOption("ft", p, r, k, cap, cp.ft_section_cost + cp.room_cost(cap), clash(env, c, k)))
    if "adj" in kinds:
        for a, adj in enumerate(inst.adjuncts):
            if arrived_only and not (env.adj_hired_week[a] >= 0 and env.adj_arrival(a) <= env.t):
                continue
            for k in adj.available:
                if env.adj_can_teach(a, c, k):
                    for r in rooms_by_k[k]:
                        cap = inst.rooms[r].capacity
                        out.append(OpenOption("adj", a, r, k, cap, adj.cost_per_section + cp.room_cost(cap), clash(env, c, k)))
    return out


def cover_orphans(env: RegistrationEnv, allow_hire: bool = True) -> None:
    """Re-staff orphaned sections. Preference order:
    FT substitute at the same time > arrived adjunct at the same time >
    reschedule with an FT professor / arrived adjunct (students change section) >
    hire an adjunct (if the lead time still lands before classes start)."""
    inst, t = env.inst, env.t
    for s in env.orphans():
        done = False
        for p in sorted(range(len(inst.profs)), key=lambda p: env.prof_load[p]):
            if env.ft_can_teach(p, s.course, s.pattern):
                done = env.apply(Action("assign", section=s.idx, instr_kind="ft", instr=p), strict=False)
                if done:
                    break
        if done:
            continue
        for a in range(len(inst.adjuncts)):
            if env.adj_can_teach(a, s.course, s.pattern) and env.adj_arrival(a) <= t:
                done = env.apply(Action("assign", section=s.idx, instr_kind="adj", instr=a), strict=False)
                if done:
                    break
        if done:
            continue
        opts = reschedule_options(env, s)
        if opts:
            o = min(opts, key=lambda o: (o.instr_kind != "ft", o.clash, abs(o.capacity - s.capacity), o.cost))
            if env.apply(Action("reschedule", section=s.idx, instr_kind=o.instr_kind, instr=o.instr,
                                room=o.room, pattern=o.pattern), strict=False):
                continue
        if not allow_hire:
            continue
        pending = any(env.adj_hired_week[a] >= 0 and env.adj_arrival(a) > t and s.course in inst.adjuncts[a].qualified
                      and env.adj_load[a] < inst.adjuncts[a].max_sections for a in range(len(inst.adjuncts)))
        if pending:
            continue
        for a, adj in enumerate(inst.adjuncts):
            if (env.adj_hired_week[a] < 0 and s.course in adj.qualified and t + adj.lead_time <= N_WEEKS
                    and env.budget >= env.S.cost.adjunct_hire_fee + adj.cost_per_section):
                env.apply(Action("hire", course=s.course, instr=a), strict=False)
                break


def best_room_move(env: RegistrationEnv, c: int) -> tuple[int, int, int] | None:
    """(section, room, seat gain) of the largest feasible room upgrade for course c."""
    best = None
    for s in env.course_sections(c):
        for r, room in enumerate(env.inst.rooms):
            gain = room.capacity - s.capacity
            if gain > 0 and env.room_ok(r, c, s.pattern) and (best is None or gain > best[2]):
                best = (s.idx, r, gain)
    return best


def pending_free(env: RegistrationEnv, c: int) -> int:
    """Seats in planned (not yet active) sections of course c."""
    return sum(s.capacity - s.enrolled for s in env.course_sections(c) if s.status == "planned")
