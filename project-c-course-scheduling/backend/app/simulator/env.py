"""Phase 2 registration environment (Powell's sequential decision model).

Timeline of epoch t = 0..5 (registration week t), then t = 6 (classes start):

    1. pre-decision housekeeping: planned sections whose activation week has
       come become active; adjuncts whose lead time has elapsed arrive;
       waitlisted students are seated FIFO in any free seat of their course.
    2. the policy observes S_t and returns decisions x_t (validated here).
    3. decisions are applied; waitlist is seated again (new capacity).
    4. exogenous information W_{t+1} for week t: new requests (seated in the
       section of their course with most free seats, else waitlisted),
       drops, professor unavailability (sections become orphaned), and
       reneging of waitlisted students whose patience ran out.

At t = 6 the policy may only assign instructors to orphaned sections; then
orphans without instructor are cancelled (students re-seated if possible,
otherwise unserved), empty sections are dropped, and the terminal cost is
computed.

State S_t (what is known when x_t is chosen) = timetable (sections with
instructor/room/pattern/capacity/status), enrolment per section, waitlist per
course (with waiting times), cumulative requests per course, adjuncts hired
or pending (arrival week), remaining adjustment budget, professors still
available. Policies read it only through the public helpers below; the
pre-drawn future (``self._scn``) is private.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..data.instance import Instance
from .params import CANCEL_FROM_WEEK, N_WEEKS, Settings
from .scenario import Scenario

NOT_ARRIVED, WAITING, LOST, DROPPED = -2, -1, -3, -4


# ------------------------------------------------------------------ actions
@dataclass(frozen=True)
class Action:
    kind: str  # open | hire | cancel | merge | move | assign | reschedule
    course: int = -1
    section: int = -1
    target: int = -1          # merge destination section
    instr_kind: str = ""      # "ft" | "adj"
    instr: int = -1
    room: int = -1
    pattern: int = -1

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v not in (-1, "")}


@dataclass
class Sec:
    idx: int
    sid: str
    course: int
    cohort: str
    instr_kind: str           # "ft" | "adj" | "" (orphan)
    instr: int
    room: int
    pattern: int
    capacity: int
    active_from: int          # week from which it seats students
    status: str = "active"    # active | planned | cancelled
    origin: str = "plan"      # plan (Phase 1) | new (opened in Phase 2)
    enrolled: int = 0
    orphan_since: int = -1


@dataclass
class EnvLog:
    weeks: list[dict] = field(default_factory=list)


class RegistrationEnv:
    def __init__(self, inst: Instance, timetable: list[dict], scenario: Scenario, settings: Settings,
                 record: bool = False):
        self.inst = inst
        self.S = settings
        self._scn = scenario
        self.record = record
        self.t = 0
        self.budget = settings.cost.budget
        self.sections: list[Sec] = []
        self.prof_busy: set[tuple[int, int]] = set()
        self.room_busy: set[tuple[int, int]] = set()
        self.prof_load = np.zeros(len(inst.profs), dtype=int)
        self.prof_gone = np.zeros(len(inst.profs), dtype=bool)
        self.adj_hired_week = np.full(len(inst.adjuncts), -1)
        self.adj_load = np.zeros(len(inst.adjuncts), dtype=int)
        self.adj_busy: set[tuple[int, int]] = set()
        nc = len(inst.courses)
        self.status = [np.full(len(a), NOT_ARRIVED, dtype=np.int32) for a in scenario.arrive]
        self.wait_start = [np.full(len(a), -1, dtype=np.int16) for a in scenario.arrive]
        self.enrol_week = [np.full(len(a), -1, dtype=np.int16) for a in scenario.arrive]
        self.requests = np.zeros(nc, dtype=int)       # cumulative requests observed
        self.lost = np.zeros(nc, dtype=int)           # reneged from waitlist
        self.unserved_terminal = np.zeros(nc, dtype=int)
        self.changed = np.zeros(nc, dtype=int)
        self.moves_admin = 0.0
        self.fees_by_course = np.zeros(nc)
        self.n_hired = 0
        self.actions_log: list[tuple[int, Action]] = []
        self.events: list[dict] = []
        self.log = EnvLog()
        self.done = False
        for row in timetable:
            s = inst.sections[row["section"]]
            cap = inst.rooms[row["room"]].capacity
            sec = Sec(len(self.sections), s.sid, s.course, s.cohort, "ft", row["prof"], row["room"],
                      row["pattern"], cap, 0)
            self._book(sec)
            self.sections.append(sec)

    # ============================================================ helpers (read-only API)
    @property
    def n_courses(self) -> int:
        return len(self.inst.courses)

    def course_sections(self, c: int, include_planned: bool = True) -> list[Sec]:
        ok = ("active", "planned") if include_planned else ("active",)
        return [s for s in self.sections if s.course == c and s.status in ok]

    def waitlist(self, c: int) -> int:
        return int(np.sum(self.status[c] == WAITING))

    def enrolled(self, c: int) -> int:
        return int(sum(s.enrolled for s in self.course_sections(c)))

    def free_seats(self, c: int, include_planned: bool = False) -> int:
        return int(sum(s.capacity - s.enrolled for s in self.course_sections(c, include_planned)
                       if include_planned or s.status == "active"))

    def capacity(self, c: int, by_week: int | None = None) -> int:
        """Capacity of course c that is active by week `by_week` (default: now, incl. planned)."""
        return int(sum(s.capacity for s in self.course_sections(c)
                       if by_week is None or s.active_from <= by_week))

    def orphans(self) -> list[Sec]:
        return [s for s in self.sections if s.status in ("active", "planned") and s.instr_kind == ""]

    def adj_arrival(self, a: int) -> int:
        h = self.adj_hired_week[a]
        return -1 if h < 0 else int(h + self.inst.adjuncts[a].lead_time)

    def room_free(self, r: int, k: int) -> bool:
        return (r, k) not in self.room_busy

    def ft_can_teach(self, p: int, c: int, k: int) -> bool:
        prof = self.inst.profs[p]
        return (not self.prof_gone[p] and c in prof.qualified and k not in prof.unavailable
                and (p, k) not in self.prof_busy and self.prof_load[p] < prof.max_sections)

    def adj_can_teach(self, a: int, c: int, k: int) -> bool:
        adj = self.inst.adjuncts[a]
        return (self.adj_hired_week[a] >= 0 and c in adj.qualified and k in adj.available
                and (a, k) not in self.adj_busy and self.adj_load[a] < adj.max_sections)

    def room_ok(self, r: int, c: int, k: int, min_cap: int = 0) -> bool:
        room = self.inst.rooms[r]
        return self.room_free(r, k) and room.capacity >= min_cap and (room.is_lab or not self.inst.courses[c].lab)

    def observed_requests(self) -> np.ndarray:
        return self.requests.copy()

    def adj_section_cost(self, a: int) -> float:
        return self.inst.adjuncts[a].cost_per_section

    # ============================================================ bookkeeping
    def _book(self, sec: Sec) -> None:
        self.room_busy.add((sec.room, sec.pattern))
        if sec.instr_kind == "ft":
            self.prof_busy.add((sec.instr, sec.pattern)); self.prof_load[sec.instr] += 1
        elif sec.instr_kind == "adj":
            self.adj_busy.add((sec.instr, sec.pattern)); self.adj_load[sec.instr] += 1

    def _unbook_instr(self, sec: Sec) -> None:
        if sec.instr_kind == "ft":
            self.prof_busy.discard((sec.instr, sec.pattern)); self.prof_load[sec.instr] -= 1
        elif sec.instr_kind == "adj":
            self.adj_busy.discard((sec.instr, sec.pattern)); self.adj_load[sec.instr] -= 1
            self.budget += self.adj_section_cost(sec.instr)  # pay is refunded if section never runs

    def _seat_waitlist(self, c: int) -> None:
        st = self.status[c]
        waiting = np.flatnonzero(st == WAITING)
        if len(waiting) == 0:
            return
        order = waiting[np.argsort(self.wait_start[c][waiting], kind="stable")]
        for i in order:
            sec = self._best_section(c)
            if sec is None:
                break
            self._seat(c, i, sec)

    def _best_section(self, c: int) -> Sec | None:
        best, best_free = None, 0
        for s in self.sections:
            if s.course == c and s.status == "active":
                free = s.capacity - s.enrolled
                if free > best_free:
                    best, best_free = s, free
        return best

    def _seat(self, c: int, i: int, sec: Sec) -> None:
        self.status[c][i] = sec.idx
        self.enrol_week[c][i] = self.t
        sec.enrolled += 1

    def _relocate(self, sec: Sec, dest: Sec | None = None) -> int:
        """Move every student of `sec` to dest (or best sibling). Returns # not re-seated."""
        c = sec.course
        idx = np.flatnonzero(self.status[c] == sec.idx)
        unplaced = 0
        sec.status = "cancelled"
        for i in idx:
            d = dest if dest is not None and dest.capacity > dest.enrolled else self._best_section(c)
            if d is None:
                self.status[c][i] = WAITING
                self.wait_start[c][i] = self.t
                unplaced += 1
            else:
                self.status[c][i] = d.idx
                d.enrolled += 1
            self.changed[c] += 1
        sec.enrolled = 0
        return unplaced

    # ============================================================ actions
    def check(self, a: Action) -> str | None:
        """Return None if action `a` is feasible in the current state, else the reason."""
        t, inst, cp = self.t, self.inst, self.S.cost
        closed = t >= N_WEEKS
        if a.kind == "hire":
            if closed:
                return "registration closed"
            if not 0 <= a.instr < len(inst.adjuncts):
                return "bad adjunct"
            if self.adj_hired_week[a.instr] >= 0:
                return "already hired"
            if self.budget < cp.adjunct_hire_fee:
                return "budget"
            return None
        if a.kind == "open":
            if closed:
                return "registration closed"
            c, k, r = a.course, a.pattern, a.room
            if not self.room_ok(r, c, k):
                return "room unavailable/unsuitable"
            if a.instr_kind == "ft":
                return None if self.ft_can_teach(a.instr, c, k) else "professor cannot teach"
            if a.instr_kind == "adj":
                if not self.adj_can_teach(a.instr, c, k):
                    return "adjunct cannot teach"
                if max(t, self.adj_arrival(a.instr)) > N_WEEKS - 1:
                    return "adjunct arrives after registration closes"
                if self.budget < self.adj_section_cost(a.instr):
                    return "budget"
                return None
            return "bad instructor kind"
        if a.kind in ("cancel", "merge"):
            if closed or t < CANCEL_FROM_WEEK:
                return f"cancellations allowed only in weeks {CANCEL_FROM_WEEK}-{N_WEEKS - 1}"
            sec = self.sections[a.section]
            if sec.status not in ("active", "planned"):
                return "section not open"
            sib = [s for s in self.course_sections(sec.course, include_planned=False) if s.idx != sec.idx]
            if a.kind == "merge":
                dst = self.sections[a.target]
                if dst.idx == sec.idx or dst.course != sec.course or dst.status != "active":
                    return "bad merge target"
                if dst.capacity - dst.enrolled < sec.enrolled:
                    return "students do not fit in target"
                return None
            if sum(s.capacity - s.enrolled for s in sib) < sec.enrolled:
                return "students do not fit in sibling sections"
            return None
        if a.kind == "move":
            if closed:
                return "registration closed"
            sec = self.sections[a.section]
            if sec.status not in ("active", "planned"):
                return "section not open"
            room = inst.rooms[a.room]
            if room.capacity <= sec.capacity:
                return "room not larger"
            if not self.room_ok(a.room, sec.course, sec.pattern):
                return "room unavailable/unsuitable"
            return None
        if a.kind == "reschedule":
            sec = self.sections[a.section]
            if sec.status not in ("active", "planned") or sec.instr_kind != "":
                return "section is not orphaned"
            c, k, r = sec.course, a.pattern, a.room
            own = (r, k) == (sec.room, sec.pattern)
            if not (own or self.room_ok(r, c, k)) or inst.rooms[r].capacity < sec.enrolled:
                return "room unavailable/unsuitable"
            if a.instr_kind == "ft":
                return None if self.ft_can_teach(a.instr, c, k) else "professor cannot teach"
            if a.instr_kind == "adj":
                if not self.adj_can_teach(a.instr, c, k):
                    return "adjunct cannot teach"
                if self.adj_arrival(a.instr) > t:
                    return "adjunct has not arrived"
                if self.budget < self.adj_section_cost(a.instr):
                    return "budget"
                return None
            return "bad instructor kind"
        if a.kind == "assign":
            sec = self.sections[a.section]
            if sec.status not in ("active", "planned") or sec.instr_kind != "":
                return "section is not orphaned"
            if a.instr_kind == "ft":
                return None if self.ft_can_teach(a.instr, sec.course, sec.pattern) else "professor cannot teach"
            if a.instr_kind == "adj":
                if not self.adj_can_teach(a.instr, sec.course, sec.pattern):
                    return "adjunct cannot teach"
                if self.adj_arrival(a.instr) > t:
                    return "adjunct has not arrived"
                if self.budget < self.adj_section_cost(a.instr):
                    return "budget"
                return None
            return "bad instructor kind"
        return "unknown action"

    def apply(self, a: Action, strict: bool = True) -> bool:
        why = self.check(a)
        if why is not None:
            if strict:
                raise ValueError(f"infeasible action {a}: {why}")
            return False
        t, cp = self.t, self.S.cost
        if a.kind == "hire":
            self.adj_hired_week[a.instr] = t
            self.budget -= cp.adjunct_hire_fee
            self.n_hired += 1
            if a.course >= 0:
                self.fees_by_course[a.course] += cp.adjunct_hire_fee
        elif a.kind == "open":
            act = t if a.instr_kind == "ft" else max(t, self.adj_arrival(a.instr))
            sec = Sec(len(self.sections), f"{self.inst.courses[a.course].code}-N{len(self.sections) + 1}",
                      a.course, "X", a.instr_kind, a.instr, a.room, a.pattern,
                      self.inst.rooms[a.room].capacity, act, "active" if act <= t else "planned", "new")
            if a.instr_kind == "adj":
                self.budget -= self.adj_section_cost(a.instr)
            self._book(sec)
            self.sections.append(sec)
            self._seat_waitlist(a.course)
        elif a.kind in ("cancel", "merge"):
            sec = self.sections[a.section]
            self.room_busy.discard((sec.room, sec.pattern))
            self._unbook_instr(sec)
            self._relocate(sec, self.sections[a.target] if a.kind == "merge" else None)
        elif a.kind == "move":
            sec = self.sections[a.section]
            self.room_busy.discard((sec.room, sec.pattern))
            sec.room = a.room
            sec.capacity = self.inst.rooms[a.room].capacity
            self.room_busy.add((sec.room, sec.pattern))
            self.moves_admin += cp.room_move_admin
            self._seat_waitlist(sec.course)
        elif a.kind == "reschedule":
            sec = self.sections[a.section]
            self.room_busy.discard((sec.room, sec.pattern))
            sec.room, sec.pattern = a.room, a.pattern
            sec.capacity = self.inst.rooms[a.room].capacity
            self.room_busy.add((sec.room, sec.pattern))
            self.changed[sec.course] += sec.enrolled  # every enrolled student sees a new time/instructor
            sec.instr_kind, sec.instr = a.instr_kind, a.instr
            if a.instr_kind == "ft":
                self.prof_busy.add((a.instr, sec.pattern)); self.prof_load[a.instr] += 1
            else:
                self.adj_busy.add((a.instr, sec.pattern)); self.adj_load[a.instr] += 1
                self.budget -= self.adj_section_cost(a.instr)
            if self.t < N_WEEKS:
                self._seat_waitlist(sec.course)
        elif a.kind == "assign":
            sec = self.sections[a.section]
            sec.instr_kind, sec.instr = a.instr_kind, a.instr
            if a.instr_kind == "ft":
                self.prof_busy.add((a.instr, sec.pattern)); self.prof_load[a.instr] += 1
            else:
                self.adj_busy.add((a.instr, sec.pattern)); self.adj_load[a.instr] += 1
                self.budget -= self.adj_section_cost(a.instr)
        self.actions_log.append((t, a))
        return True

    # ============================================================ dynamics
    def _housekeeping(self) -> None:
        for s in self.sections:
            if s.status == "planned" and s.active_from <= self.t:
                s.status = "active"
        if self.t < N_WEEKS:
            for c in range(self.n_courses):
                self._seat_waitlist(c)

    def _exogenous(self) -> None:
        t, scn = self.t, self._scn
        for c in range(self.n_courses):
            st, arr = self.status[c], scn.arrive[c]
            # drops: enrolled students whose drop time has come
            enrolled = np.flatnonzero(st >= 0)
            if len(enrolled):
                drop = enrolled[(t - self.enrol_week[c][enrolled] + 1) >= scn.drop_after[c][enrolled]]
                for i in drop:
                    self.sections[st[i]].enrolled -= 1
                    st[i] = DROPPED
            # new requests this week
            new = np.flatnonzero((arr == t) & (st == NOT_ARRIVED))
            self.requests[c] += len(new)
            for i in new:
                sec = self._best_section(c)
                if sec is None:
                    st[i] = WAITING
                    self.wait_start[c][i] = t
                else:
                    self._seat(c, i, sec)
            # reneging: waited (t - start + 1) weeks >= patience
            waiting = np.flatnonzero(st == WAITING)
            if len(waiting):
                gone = waiting[(t - self.wait_start[c][waiting] + 1) >= scn.patience[c][waiting]]
                st[gone] = LOST
                self.lost[c] += len(gone)
        # professor unavailability
        for p in np.flatnonzero((scn.unavail_week == t) & ~self.prof_gone):
            self.prof_gone[p] = True
            hit = []
            for s in self.sections:
                if s.status in ("active", "planned") and s.instr_kind == "ft" and s.instr == p:
                    self.prof_busy.discard((p, s.pattern)); self.prof_load[p] -= 1
                    s.instr_kind, s.instr, s.orphan_since = "", -1, t
                    hit.append(s.sid)
            self.events.append({"week": int(t), "type": "prof_unavailable", "prof": int(p), "sections": hit})

    def _terminal(self) -> None:
        for s in self.sections:
            if s.status in ("active", "planned") and s.instr_kind == "":
                self.room_busy.discard((s.room, s.pattern))
                unplaced = self._relocate(s)
                self.changed[s.course] -= unplaced  # counted as unserved instead
                self.events.append({"week": N_WEEKS, "type": "orphan_cancelled", "section": s.sid,
                                    "unplaced": int(unplaced)})
        for c in range(self.n_courses):
            w = int(np.sum(self.status[c] == WAITING))
            self.unserved_terminal[c] = w
            self.status[c][self.status[c] == WAITING] = LOST
        for s in self.sections:
            if s.status in ("active", "planned") and s.enrolled == 0:
                self.room_busy.discard((s.room, s.pattern))
                self._unbook_instr(s)
                s.status = "cancelled"
        self.done = True

    def run(self, policy) -> dict:
        policy.reset(self)
        for t in range(N_WEEKS + 1):
            self.t = t
            self._housekeeping()
            before = self._snapshot() if self.record else None
            acts = policy.decide(self) or []
            for a in acts:
                self.apply(a, strict=False)
            if t < N_WEEKS:
                for c in range(self.n_courses):
                    self._seat_waitlist(c)
                self._exogenous()
            else:
                self._terminal()
            if self.record:
                self.log.weeks.append({"week": t, "state": before,
                                       "actions": [x.as_dict() for (w, x) in self.actions_log if w == t],
                                       "after": self._snapshot(),
                                       "events": [e for e in self.events if e["week"] == t],
                                       "plan": getattr(policy, "last_plan_summary", None)})
        return self.outcome()

    # ============================================================ costs
    def course_cost(self, c: int) -> float:
        """Committed cost attributable to course c so far (used as RL reward signal)."""
        cp = self.S.cost
        cost = self.fees_by_course[c]
        for s in self.sections:
            if s.course != c or s.status == "cancelled":
                continue
            cost += cp.room_cost(s.capacity)
            if s.instr_kind == "ft":
                cost += cp.ft_section_cost
            elif s.instr_kind == "adj":
                cost += self.adj_section_cost(s.instr)
        cost += cp.penalty_unserved * (self.lost[c] + self.unserved_terminal[c])
        cost += cp.penalty_change * self.changed[c]
        return float(cost)

    def outcome(self) -> dict:
        cp = self.S.cost
        running = [s for s in self.sections if s.status in ("active", "planned")]
        instr = sum(cp.ft_section_cost if s.instr_kind == "ft" else self.adj_section_cost(s.instr)
                    for s in running if s.instr_kind)
        fees = cp.adjunct_hire_fee * self.n_hired
        rooms = sum(cp.room_cost(s.capacity) for s in running)
        unserved = int(self.lost.sum() + self.unserved_terminal.sum())
        changed = int(self.changed.sum())
        total = instr + fees + rooms + self.moves_admin + cp.penalty_unserved * unserved + cp.penalty_change * changed
        demand = int(self._scn.demand.sum())
        return {
            "total_cost": float(total), "instructor_cost": float(instr), "adjunct_fees": float(fees),
            "room_cost": float(rooms), "move_admin": float(self.moves_admin),
            "unserved_penalty": float(cp.penalty_unserved * unserved),
            "change_penalty": float(cp.penalty_change * changed),
            "unserved": unserved, "changed": changed, "demand": demand,
            "served_share": 1 - unserved / max(1, demand),
            "sections_running": len(running),
            "sections_opened": sum(1 for s in self.sections if s.origin == "new" and s.status != "cancelled"),
            "sections_cancelled": sum(1 for s in self.sections if s.status == "cancelled"),
            "adjuncts_hired": int(self.n_hired), "budget_left": float(self.budget),
            "prof_events": sum(1 for e in self.events if e["type"] == "prof_unavailable"),
            "orphans_cancelled": sum(1 for e in self.events if e["type"] == "orphan_cancelled"),
        }

    # ============================================================ snapshot for the dashboard
    def _snapshot(self) -> dict:
        secs = [{"idx": s.idx, "sid": s.sid, "course": s.course, "cohort": s.cohort, "instr_kind": s.instr_kind,
                 "instr": int(s.instr), "room": int(s.room), "pattern": int(s.pattern), "capacity": int(s.capacity),
                 "enrolled": int(s.enrolled), "status": s.status, "origin": s.origin,
                 "active_from": int(s.active_from)} for s in self.sections if s.status != "cancelled"]
        return {
            "sections": secs,
            "waitlist": [self.waitlist(c) for c in range(self.n_courses)],
            "requests": self.requests.tolist(),
            "lost": self.lost.tolist(),
            "budget": float(self.budget),
            "adjuncts": [{"hired_week": int(h), "arrival": self.adj_arrival(a), "load": int(self.adj_load[a])}
                         for a, h in enumerate(self.adj_hired_week)],
            "profs_gone": [int(p) for p in np.flatnonzero(self.prof_gone)],
        }
