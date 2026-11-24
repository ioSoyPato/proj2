"""Solve Phase 1 (both strategies), check feasibility, persist to results/phase1.json."""
from __future__ import annotations

import json
from functools import lru_cache

from ..config import RESULTS_DIR
from ..data.instance import load_instance
from .checker import check_timetable
from .model import WEIGHTS, breakdown, solve_decomposed, solve_monolithic

PHASE1_FILE = RESULTS_DIR / "phase1.json"


def solve_and_save() -> dict:
    inst = load_instance()
    mono, mres = solve_monolithic(inst)
    deco, dinfo = solve_decomposed(inst)
    rows = [a.__dict__ for a in mono]
    out = {
        "chosen": "monolithic",
        "weights": WEIGHTS,
        "timetable": rows,
        "monolithic": {"result": mres.as_dict(), "breakdown": breakdown(inst, mono),
                       "violations": check_timetable(inst, rows)},
        "decomposed": {"info": dinfo, "breakdown": breakdown(inst, deco),
                       "timetable": [a.__dict__ for a in deco],
                       "violations": check_timetable(inst, [a.__dict__ for a in deco])},
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    PHASE1_FILE.write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    get_phase1.cache_clear()
    return out


@lru_cache(maxsize=1)
def get_phase1() -> dict:
    if not PHASE1_FILE.is_file():
        return solve_and_save()
    return json.loads(PHASE1_FILE.read_text(encoding="utf-8"))


def get_timetable() -> list[dict]:
    return get_phase1()["timetable"]
