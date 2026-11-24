"""Load the course-scheduling instance (synthetic by default) + enrollment forecast."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import COURSE_DATA_DIR, DATA_DIR

HOURS_PER_SECTION = 4  # two 2-hour sessions per week
DAMPING = 0.5          # damped-trend forecast: half of the OLS slope is extrapolated


@dataclass(frozen=True)
class Course:
    idx: int
    code: str
    name_en: str
    name_es: str
    semester: int
    area: str
    lab: bool
    n_sections: int
    forecast: float        # damped-trend point forecast of 2026 total enrollment
    sigma_rel: float       # relative forecast uncertainty (residual-based)
    true_mean: float       # simulator ground truth -- never read by policies


@dataclass(frozen=True)
class Section:
    idx: int
    sid: str
    course: int
    cohort: str
    forecast: int          # ceil(course forecast / planned sections)


@dataclass(frozen=True)
class Professor:
    idx: int
    pid: str
    name: str
    area: str
    qualified: frozenset[int]
    primary: frozenset[int]
    min_sections: int
    max_sections: int
    preferred: frozenset[int]
    unavailable: frozenset[int]


@dataclass(frozen=True)
class Adjunct:
    idx: int
    aid: str
    name: str
    qualified: frozenset[int]
    cost_per_section: float
    lead_time: int
    max_sections: int
    available: frozenset[int]


@dataclass(frozen=True)
class Room:
    idx: int
    rid: str
    name: str
    capacity: int
    is_lab: bool


@dataclass
class Instance:
    courses: list[Course]
    sections: list[Section]
    profs: list[Professor]
    adjuncts: list[Adjunct]
    rooms: list[Room]
    patterns: pd.DataFrame
    history: pd.DataFrame
    cohorts: list[str]
    meta: dict
    source: str
    forecast_table: pd.DataFrame = field(default_factory=pd.DataFrame)

    @property
    def n_patterns(self) -> int:
        return len(self.patterns)

    def pattern_block(self, k: int) -> int:
        return int(self.patterns.block.iloc[k])

    def course_by_code(self, code: str) -> Course:
        return next(c for c in self.courses if c.code == code)


# ---------------------------------------------------------------- forecast
def damped_trend_forecast(y: np.ndarray, phi: float = DAMPING) -> tuple[float, float, float]:
    """OLS line on t=0..n-1, forecast t=n with a damped slope.

    Returns (forecast, slope, residual_std). F = (a + b(n-1)) + phi*b.
    """
    t = np.arange(len(y), dtype=float)
    b, a = np.polyfit(t, y, 1)
    resid = y - (a + b * t)
    s = float(np.sqrt(np.sum(resid**2) / max(1, len(y) - 2)))
    return float(a + b * (len(y) - 1) + phi * b), float(b), s


def build_forecast_table(history: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for code, g in history.sort_values("year").groupby("course"):
        y = g.enrolled.to_numpy(float)
        f, slope, s = damped_trend_forecast(y)
        bt, _, _ = damped_trend_forecast(y[:-1])  # backtest: predict last year from first four
        rows.append({
            "course": code, "forecast_2026": f, "slope": slope, "resid_sd": s,
            "sigma_rel": max(0.08, s / max(f, 1.0)),
            "backtest_pred_2025": bt, "actual_2025": y[-1],
            "backtest_ape": abs(bt - y[-1]) / y[-1],
            "naive_ape": abs(y[-2] - y[-1]) / y[-1],
            "mean_ape": abs(y[:-1].mean() - y[-1]) / y[-1],
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- loader
def _read(dir_: Path) -> Instance:
    courses_df = pd.read_csv(dir_ / "courses.csv")
    sections_df = pd.read_csv(dir_ / "sections.csv")
    rooms_df = pd.read_csv(dir_ / "rooms.csv")
    patterns = pd.read_csv(dir_ / "patterns.csv")
    history = pd.read_csv(dir_ / "enrollment_history.csv")
    profs_js = json.loads((dir_ / "professors.json").read_text(encoding="utf-8"))
    adj_js = json.loads((dir_ / "adjuncts.json").read_text(encoding="utf-8"))
    meta = json.loads((dir_ / "meta.json").read_text(encoding="utf-8"))

    fc = build_forecast_table(history).set_index("course")
    code2idx = {c: i for i, c in enumerate(courses_df.course)}
    courses: list[Course] = []
    for i, r in courses_df.iterrows():
        f = fc.loc[r.course]
        true_mean = float(r.true_mean_2026) if "true_mean_2026" in r and not pd.isna(r.true_mean_2026) else float(f.forecast_2026)
        courses.append(Course(int(i), r.course, r.name_en, r.name_es, int(r.semester), r.area,
                              bool(r.lab_required), int(r.n_sections), float(f.forecast_2026),
                              float(f.sigma_rel), true_mean))
    sections = []
    for i, r in sections_df.iterrows():
        c = courses[code2idx[r.course]]
        sections.append(Section(int(i), r.section, c.idx, r.cohort, int(math.ceil(c.forecast / c.n_sections))))
    profs = [Professor(i, p["id"], p["name"], p["area"],
                       frozenset(code2idx[q] for q in p["qualified"]),
                       frozenset(code2idx[q] for q in p["primary"]),
                       p["min_hours"] // HOURS_PER_SECTION, p["max_hours"] // HOURS_PER_SECTION,
                       frozenset(p["preferred_patterns"]), frozenset(p["unavailable_patterns"]))
             for i, p in enumerate(profs_js)]
    adjuncts = [Adjunct(i, a["id"], a["name"], frozenset(code2idx[q] for q in a["qualified"]),
                        float(a["cost_per_section"]), int(a["lead_time_weeks"]), int(a["max_sections"]),
                        frozenset(a["available_patterns"]))
                for i, a in enumerate(adj_js)]
    rooms = [Room(int(i), r.room, r.name, int(r.capacity), bool(r.is_lab)) for i, r in rooms_df.iterrows()]
    cohorts = sorted(sections_df.cohort.unique().tolist())
    return Instance(courses, sections, profs, adjuncts, rooms, patterns, history, cohorts, meta,
                    source=str(dir_), forecast_table=fc.reset_index())


@lru_cache(maxsize=1)
def load_instance() -> Instance:
    if COURSE_DATA_DIR is not None and (COURSE_DATA_DIR / "courses.csv").is_file():
        return _read(COURSE_DATA_DIR)
    if not (DATA_DIR / "courses.csv").is_file():
        from .generator import generate
        generate()
    return _read(DATA_DIR)
