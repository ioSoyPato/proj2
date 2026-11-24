"""Independent feasibility checker for a timetable.

Deliberately re-implements every hard constraint from the raw instance
fields (it does NOT import the MILP's filtering helpers) so a bug in the
model-building code cannot hide itself.
"""
from __future__ import annotations

import math
from collections import Counter

from ..data.instance import Instance


def check_timetable(inst: Instance, rows: list[dict]) -> list[str]:
    """rows: dicts with keys section, prof, room, pattern (instance indices).

    Returns a list of human-readable violations (empty == feasible).
    """
    v: list[str] = []
    n_pat = len(inst.patterns)
    # 1. every planned section exactly once
    cnt = Counter(r["section"] for r in rows)
    for s, sec in enumerate(inst.sections):
        if cnt.get(s, 0) != 1:
            v.append(f"section {sec.sid} assigned {cnt.get(s, 0)} times")
    extra = set(cnt) - set(range(len(inst.sections)))
    if extra:
        v.append(f"unknown sections {sorted(extra)}")
    for r in rows:
        if not 0 <= r["pattern"] < n_pat:
            v.append(f"bad pattern {r['pattern']}")
    # 2. no professor / room / cohort used twice in the same pattern
    for key, label in (("prof", "professor"), ("room", "room")):
        c2 = Counter((r[key], r["pattern"]) for r in rows)
        for (x, k), n in c2.items():
            if n > 1:
                v.append(f"{label} {x} double-booked at pattern {k}")
    c3 = Counter((inst.sections[r["section"]].cohort, r["pattern"]) for r in rows)
    for (coh, k), n in c3.items():
        if n > 1:
            v.append(f"cohort {coh} has {n} sections at pattern {k}")
    # 3. qualification, availability, load
    load = Counter(r["prof"] for r in rows)
    for r in rows:
        sec = inst.sections[r["section"]]
        prof = inst.profs[r["prof"]]
        code = inst.courses[sec.course].code
        if sec.course not in prof.qualified:
            v.append(f"{prof.pid} not qualified for {code}")
        if r["pattern"] in prof.unavailable:
            v.append(f"{prof.pid} unavailable at pattern {r['pattern']}")
    for p, prof in enumerate(inst.profs):
        hours = 4 * load.get(p, 0)
        if not (4 * prof.min_sections <= hours <= 4 * prof.max_sections):
            v.append(f"{prof.pid} load {hours}h outside [{4 * prof.min_sections}, {4 * prof.max_sections}]")
    # 4. room capacity covers the forecast; lab courses in labs
    for r in rows:
        sec = inst.sections[r["section"]]
        course = inst.courses[sec.course]
        room = inst.rooms[r["room"]]
        need = math.ceil(course.forecast / course.n_sections)
        if room.capacity < need:
            v.append(f"{sec.sid}: room {room.rid} ({room.capacity}) < forecast {need}")
        if course.lab and not room.is_lab:
            v.append(f"{sec.sid}: lab course in non-lab room {room.rid}")
    return v
