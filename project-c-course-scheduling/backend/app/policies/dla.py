"""DLA: weekly re-optimisation with a deterministic lookahead MILP.

At epoch t we build a MILP over the remaining registration weeks
tau = t..5 using the CURRENT state (timetable, enrolment, waitlists, hires,
budget, orphaned sections) and a point forecast of the requests still to
come (Gamma-Poisson posterior, inflated by the tunable safety factor theta).
The model may plan decisions in future weeks (open a section at tau > t,
hire an adjunct now to teach from tau = t + 2, ...), but ONLY the decisions
indexed tau = t are executed; the rest is discarded and re-planned next week
with new information (rolling horizon).

Variables (binary unless noted):
  o[j,tau]  open candidate section j (course, instructor, room, pattern) in week tau
  h[a,tau]  hire adjunct a in week tau (teaches from tau + lead time)
  x[s]      cancel under-enrolled section s now (week >= 2), students re-seated
  m[s,r]    move section s to the larger free room r now
  g[s,i]    give orphaned section s instructor i (FT now, adjunct when arrived)
  e[c,tau], w[c,tau], eT[c] >= 0 (continuous): seated, waiting, seated at term start

Flow (per course in the focus set):
  e[c,tau] + w[c,tau] = e[c,tau-1] + (1 - rho) w[c,tau-1] + theta * dhat[c,tau]
  e[c,tau] <= Capacity[c,tau](o, x, m)
  eT[c] <= e[c,5],  eT[c] <= Capacity[c,5] - sum_{orphans s} cap_s (1 - sum_i g[s,i])
  unserved[c] = rho * sum_{tau<5} w[c,tau] + w[c,5] + (e[c,5] - eT[c])

Objective: new instructor + room costs + hire fees - savings of cancelled
sections + P_change * students moved + room-move costs + P_unserved * unserved.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np

from ..phase1.solver import MilpModel
from ..simulator.env import Action, RegistrationEnv
from ..simulator.params import CANCEL_FROM_WEEK, N_WEEKS
from .common import Policy, clash, remaining_by_week, reschedule_options

RHO_HAT = 0.15  # department's estimate of weekly waitlist abandonment


class WeeklyReoptimization(Policy):
    name = "dla"
    label = "Weekly re-optimization (DLA)"
    policy_class = "DLA"

    def __init__(self, theta: float = 1.0, max_ft: int = 3, opts_per_instr: int = 2, time_limit: float = 5.0):
        self.theta = float(theta)
        self.max_ft = max_ft
        self.opts_per_instr = opts_per_instr
        self.time_limit = time_limit
        self.solve_stats: list[dict] = []

    def params(self) -> dict:
        return {"theta": self.theta}

    def reset(self, env: RegistrationEnv) -> None:
        super().reset(env)
        self.solve_stats = []
        self.last_future: list[tuple[int, Action]] = []
        self.last_applied: list[tuple[int, Action]] = []

    # ------------------------------------------------------------------ candidates
    def _candidates(self, env: RegistrationEnv, c: int, short: float) -> list[dict]:
        inst, cp, t = env.inst, env.S.cost, env.t
        out: list[dict] = []

        def best_two(opts: list[tuple[int, int, int]]) -> list[tuple[int, int, int]]:
            # opts: (room, pattern, cap); pick smallest room covering the shortfall and the largest room
            if not opts:
                return []
            opts.sort(key=lambda o: (clash(env, c, o[1]), o[2]))
            fit = [o for o in opts if o[2] >= short]
            pick = [min(fit, key=lambda o: o[2]) if fit else max(opts, key=lambda o: o[2])]
            big = max(opts, key=lambda o: o[2])
            if big != pick[0]:
                pick.append(big)
            return pick[: self.opts_per_instr]

        free_rooms = {k: [r for r in range(len(inst.rooms)) if env.room_ok(r, c, k)] for k in range(inst.n_patterns)}
        ft = [p for p in range(len(inst.profs)) if not env.prof_gone[p] and c in inst.profs[p].qualified
              and env.prof_load[p] < inst.profs[p].max_sections]
        ft.sort(key=lambda p: env.prof_load[p] - inst.profs[p].max_sections)
        for p in ft[: self.max_ft]:
            opts = [(r, k, inst.rooms[r].capacity) for k in range(inst.n_patterns) if env.ft_can_teach(p, c, k)
                    for r in free_rooms[k]]
            for r, k, cap in best_two(opts):
                out.append({"course": c, "kind": "ft", "instr": p, "room": r, "pattern": k, "cap": cap,
                            "cost": cp.ft_section_cost + cp.room_cost(cap), "first": t})
        for a, adj in enumerate(inst.adjuncts):
            if c not in adj.qualified or env.adj_load[a] >= adj.max_sections:
                continue
            hired = env.adj_hired_week[a] >= 0
            first = max(t, env.adj_arrival(a)) if hired else t + adj.lead_time
            if first > N_WEEKS - 1:
                continue
            opts = [(r, k, inst.rooms[r].capacity) for k in adj.available if (a, k) not in env.adj_busy
                    for r in free_rooms[k]]
            for r, k, cap in best_two(opts):
                out.append({"course": c, "kind": "adj", "instr": a, "room": r, "pattern": k, "cap": cap,
                            "cost": adj.cost_per_section + cp.room_cost(cap), "pay": adj.cost_per_section,
                            "first": first, "hired": hired})
        return out

    # ------------------------------------------------------------------ decide
    def decide(self, env: RegistrationEnv) -> list[Action]:
        t, inst, cp = env.t, env.inst, env.S.cost
        T = N_WEEKS
        orphans = env.orphans()
        self.last_future, self.last_applied = [], []
        if t >= T:
            # classes start: only re-staff orphans with whoever is available
            from .common import cover_orphans
            cover_orphans(env, allow_hire=False)
            return []
        weeks = list(range(t, T))
        dhat = remaining_by_week(env, self.theta)
        E = np.array([env.enrolled(c) for c in range(env.n_courses)], dtype=float)
        W = np.array([env.waitlist(c) for c in range(env.n_courses)], dtype=float)
        cap_by = {c: {tau: env.capacity(c, by_week=tau) for tau in weeks} for c in range(env.n_courses)}
        proj = E + W + dhat.sum(axis=1)

        # cancel candidates
        cancel_c: dict[int, list] = defaultdict(list)
        if t >= CANCEL_FROM_WEEK:
            for c in range(env.n_courses):
                secs = env.course_sections(c, include_planned=False)
                if len(secs) < 2:
                    continue
                for s in secs:
                    if s.instr_kind == "" or s.enrolled >= 0.6 * s.capacity:
                        continue
                    sib_free = sum(x.capacity - x.enrolled for x in secs if x.idx != s.idx)
                    if s.enrolled <= sib_free:
                        cancel_c[c].append(s)
        orphan_c = defaultdict(list)
        for s in orphans:
            orphan_c[s.course].append(s)
        focus = [c for c in range(env.n_courses)
                 if proj[c] > 0.92 * cap_by[c][T - 1] or c in cancel_c or c in orphan_c]

        m = MilpModel()
        # ---- open candidates
        cands: list[dict] = []
        for c in focus:
            short = max(0.0, proj[c] - cap_by[c][T - 1])
            if short > 0.5 or W[c] > 0:
                cands.extend(self._candidates(env, c, short))
        o: dict[tuple[int, int], int] = {}
        for j, cd in enumerate(cands):
            for tau in weeks:
                if tau >= cd["first"]:
                    o[j, tau] = m.add_var(cd["cost"])
            js = [o[j, tau] for tau in weeks if (j, tau) in o]
            if len(js) > 1:
                m.add_row(js, [1] * len(js), -np.inf, 1)
        # ---- hires
        h: dict[tuple[int, int], int] = {}
        unhired = [a for a in range(len(inst.adjuncts)) if env.adj_hired_week[a] < 0]
        for a in unhired:
            L = inst.adjuncts[a].lead_time
            for tau in weeks:
                if tau + L <= T:  # useful at least for orphan cover at term start
                    h[a, tau] = m.add_var(cp.adjunct_hire_fee)
            hs = [h[a, tau] for tau in weeks if (a, tau) in h]
            if len(hs) > 1:
                m.add_row(hs, [1] * len(hs), -np.inf, 1)
        for j, cd in enumerate(cands):  # unhired adjunct teaches only after its lead time
            if cd["kind"] == "adj" and not cd["hired"]:
                L = inst.adjuncts[cd["instr"]].lead_time
                for tau in weeks:
                    if (j, tau) in o:
                        hs = [h[cd["instr"], tp] for tp in weeks if tp <= tau - L and (cd["instr"], tp) in h]
                        m.add_row([o[j, tau]] + hs, [1] + [-1] * len(hs), -np.inf, 0)
        # ---- cancels
        x: dict[int, int] = {}
        for c, secs in cancel_c.items():
            for s in secs:
                save = cp.room_cost(s.capacity) + (cp.ft_section_cost if s.instr_kind == "ft" else env.adj_section_cost(s.instr))
                x[s.idx] = m.add_var(-save + cp.penalty_change * s.enrolled)
            m.add_row([x[s.idx] for s in secs], [1] * len(secs), -np.inf, 1)
        # ---- room moves
        mv: dict[tuple[int, int], int] = {}
        for c in focus:
            if proj[c] <= cap_by[c][T - 1]:
                continue
            for s in env.course_sections(c):
                for r, room in enumerate(inst.rooms):
                    if room.capacity > s.capacity and env.room_ok(r, c, s.pattern):
                        mv[s.idx, r] = m.add_var(cp.room_move_admin + cp.room_cost(room.capacity) - cp.room_cost(s.capacity))
                rs = [mv[s.idx, r] for r in range(len(inst.rooms)) if (s.idx, r) in mv]
                if s.idx in x:
                    rs = rs + [x[s.idx]]
                if len(rs) > 1:
                    m.add_row(rs, [1] * len(rs), -np.inf, 1)
        # ---- orphan covers: same time (assign) or new time/room (reschedule, students change)
        # key: (section, kind, instr, pattern, room)
        g: dict[tuple[int, str, int, int, int], int] = {}
        g_cap: dict[tuple, int] = {}
        for s in orphans:
            opts: list[tuple[str, int, int, int]] = []  # kind, instr, pattern, room
            for p in range(len(inst.profs)):
                if env.ft_can_teach(p, s.course, s.pattern):
                    opts.append(("ft", p, s.pattern, s.room))
            ft_alt = [o for o in reschedule_options(env, s, ("ft",)) if o.pattern != s.pattern]
            ft_alt.sort(key=lambda o: (o.clash, abs(o.capacity - s.capacity), o.cost))
            opts += [("ft", o.instr, o.pattern, o.room) for o in ft_alt[:4]]
            for a, adj in enumerate(inst.adjuncts):
                if s.course not in adj.qualified or env.adj_load[a] >= adj.max_sections:
                    continue
                if env.adj_hired_week[a] >= 0 and env.adj_arrival(a) > T:
                    continue
                if env.adj_hired_week[a] < 0 and not any((a, tp) in h and tp + adj.lead_time <= T for tp in weeks):
                    continue
                pats = [k for k in adj.available if (a, k) not in env.adj_busy]
                best = None
                for k in pats:
                    rooms = [r for r in range(len(inst.rooms))
                             if (r, k) == (s.room, s.pattern) or (env.room_ok(r, s.course, k)
                                                                  and inst.rooms[r].capacity >= s.enrolled)]
                    if rooms:
                        r = min(rooms, key=lambda r: abs(inst.rooms[r].capacity - s.capacity))
                        cand = (k != s.pattern, clash(env, s.course, k), k, r)
                        best = cand if best is None or cand < best else best
                if best is not None:
                    opts.append(("adj", a, best[2], best[3]))
            for kind, i, k, r in opts:
                moved = (k, r) != (s.pattern, s.room)
                instr_cost = cp.ft_section_cost if kind == "ft" else inst.adjuncts[i].cost_per_section
                cost = instr_cost + cp.room_cost(inst.rooms[r].capacity) - cp.penalty_change * s.enrolled
                if moved:
                    cost += cp.penalty_change * s.enrolled
                key = (s.idx, kind, i, k, r)
                g[key] = m.add_var(cost)  # relative to leaving it uncovered (room saved, students displaced)
                g_cap[key] = inst.rooms[r].capacity
                if kind == "adj" and env.adj_hired_week[i] < 0:
                    hs = [h[i, tp] for tp in weeks if (i, tp) in h and tp + inst.adjuncts[i].lead_time <= T]
                    m.add_row([g[key]] + hs, [1] + [-1] * len(hs), -np.inf, 0)
            gs = [v for key, v in g.items() if key[0] == s.idx]
            if gs:
                m.add_row(gs, [1] * len(gs), -np.inf, 1)

        # ---- resource conflicts: instructor-pattern, room-pattern, loads, budget
        rows_ik: dict[tuple, list[int]] = defaultdict(list)
        rows_rk: dict[tuple, list[int]] = defaultdict(list)
        load_ft: dict[int, list[int]] = defaultdict(list)
        load_adj: dict[int, list[int]] = defaultdict(list)
        budget_idx, budget_coef = [], []
        for (j, tau), v in o.items():
            cd = cands[j]
            rows_ik[cd["kind"], cd["instr"], cd["pattern"]].append(v)
            rows_rk[cd["room"], cd["pattern"]].append(v)
            (load_ft if cd["kind"] == "ft" else load_adj)[cd["instr"]].append(v)
            if cd["kind"] == "adj":
                budget_idx.append(v); budget_coef.append(cd["pay"])
        for (si, kind, i, k, r), v in g.items():
            rows_ik[kind, i, k].append(v)
            if (k, r) != (env.sections[si].pattern, env.sections[si].room):
                rows_rk[r, k].append(v)
            (load_ft if kind == "ft" else load_adj)[i].append(v)
            if kind == "adj":
                budget_idx.append(v); budget_coef.append(env.adj_section_cost(i))
        for (si, r), v in mv.items():
            rows_rk[r, env.sections[si].pattern].append(v)
        for (a, tau), v in h.items():
            budget_idx.append(v); budget_coef.append(cp.adjunct_hire_fee)
        for vs in list(rows_ik.values()) + list(rows_rk.values()):
            if len(vs) > 1:
                m.add_row(vs, [1] * len(vs), -np.inf, 1)
        for p, vs in load_ft.items():
            m.add_row(vs, [1] * len(vs), -np.inf, inst.profs[p].max_sections - env.prof_load[p])
        for a, vs in load_adj.items():
            m.add_row(vs, [1] * len(vs), -np.inf, inst.adjuncts[a].max_sections - env.adj_load[a])
        if budget_idx:
            m.add_row(budget_idx, budget_coef, -np.inf, env.budget)

        # ---- enrolment flow per focus course
        for c in focus:
            def cap_expr(tau: int) -> tuple[list[int], list[float], float]:
                idx, coef = [], []
                for (j, tp), v in o.items():
                    if cands[j]["course"] == c and tp <= tau:
                        idx.append(v); coef.append(cands[j]["cap"])
                for s in cancel_c.get(c, []):
                    idx.append(x[s.idx]); coef.append(-s.capacity)
                for (si, r), v in mv.items():
                    if env.sections[si].course == c:
                        idx.append(v); coef.append(inst.rooms[r].capacity - env.sections[si].capacity)
                return idx, coef, float(cap_by[c][tau])

            e = {tau: m.add_var(0.0, 0, np.inf, False) for tau in weeks}
            w = {tau: m.add_var(cp.penalty_unserved * (RHO_HAT if tau < T - 1 else 1.0), 0, np.inf, False) for tau in weeks}
            for tau in weeks:
                idx, coef, const = cap_expr(tau)
                m.add_row([e[tau]] + idx, [1] + [-cf for cf in coef], -np.inf, const)
                if tau == t:
                    m.add_row([e[tau], w[tau]], [1, 1], E[c] + W[c] + dhat[c, tau], E[c] + W[c] + dhat[c, tau])
                else:
                    m.add_row([e[tau], w[tau], e[tau - 1], w[tau - 1]], [1, 1, -1, -(1 - RHO_HAT)],
                              dhat[c, tau], dhat[c, tau])
            eT = m.add_var(-cp.penalty_unserved, 0, np.inf, False)
            m.c[e[T - 1]] += cp.penalty_unserved  # unserved += e5 - eT
            m.add_row([eT, e[T - 1]], [1, -1], -np.inf, 0)
            idx, coef, const = cap_expr(T - 1)
            g_idx, g_coef = [], []
            for s in orphan_c.get(c, []):
                const -= s.capacity
                for key, v in g.items():
                    if key[0] == s.idx:
                        g_idx.append(v); g_coef.append(g_cap[key])
            m.add_row([eT] + idx + g_idx, [1] + [-cf for cf in coef] + [-cf for cf in g_coef], -np.inf, const)

        res = m.solve(time_limit=self.time_limit, mip_gap=0.005, backend="highs")
        self.solve_stats.append({"week": t, "status": res.status, "seconds": res.seconds,
                                 "n_vars": res.n_vars, "n_cons": res.n_cons})
        if res.x is None:
            from .common import cover_orphans
            cover_orphans(env)
            self.last_plan_summary = {"status": res.status}
            return []
        X = res.x
        on = lambda v: X[v] > 0.5  # noqa: E731

        # ---- execute ONLY this week's decisions (tau == t); keep the rest as a plan summary
        future_opens = sum(1 for (j, tau), v in o.items() if tau > t and on(v))
        self.last_future = [(tau, Action("open", course=cands[j]["course"], instr_kind=cands[j]["kind"],
                                         instr=cands[j]["instr"], room=cands[j]["room"], pattern=cands[j]["pattern"]))
                            for (j, tau), v in o.items() if tau > t and on(v)]
        self.last_future += [(tau, Action("hire", instr=a)) for (a, tau), v in h.items() if tau > t and on(v)]
        future_hires = sum(1 for (a, tau), v in h.items() if tau > t and on(v))
        applied: list[Action] = []
        for (a, tau), v in h.items():
            if tau == t and on(v):
                course = next((cd["course"] for j, cd in enumerate(cands) if cd["kind"] == "adj" and cd["instr"] == a), -1)
                applied.append(Action("hire", course=course, instr=a))
        for si, v in x.items():
            if on(v):
                applied.append(Action("cancel", section=si))
        for (si, r), v in mv.items():
            if on(v):
                applied.append(Action("move", section=si, room=r))
        for (j, tau), v in o.items():
            if tau == t and on(v):
                cd = cands[j]
                applied.append(Action("open", course=cd["course"], instr_kind=cd["kind"], instr=cd["instr"],
                                      room=cd["room"], pattern=cd["pattern"]))
        for (si, kind, i, k, r), v in g.items():
            if on(v) and (kind == "ft" or (env.adj_hired_week[i] >= 0 and env.adj_arrival(i) <= t)):
                sec = env.sections[si]
                if (k, r) == (sec.pattern, sec.room):
                    applied.append(Action("assign", section=si, instr_kind=kind, instr=i))
                else:
                    applied.append(Action("reschedule", section=si, instr_kind=kind, instr=i, room=r, pattern=k))
        for a in applied:
            env.apply(a, strict=False)
        self.last_plan_summary = {
            "status": res.status, "objective": res.objective, "seconds": round(res.seconds, 3),
            "n_vars": res.n_vars, "n_cons": res.n_cons, "focus_courses": len(focus),
            "applied_now": len(applied), "future_opens_planned": future_opens,
            "future_hires_planned": future_hires,
        }
        self.last_applied = [(t, a) for a in applied]
        return []
