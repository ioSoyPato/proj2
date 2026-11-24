"""Seeded generator for the SYNTHETIC course-scheduling instance.

The assignment says the data are "provided by the course" (synthetic). The
files were not supplied to us, so this module generates an instance with
exactly the specified shape and writes it to ``app/data/files`` (committed).
Run ``python -m app.data.generator`` to regenerate -- the output is fully
determined by ``GENERATOR_SEED``.

Shape (per spec)
----------------
* 25 courses from program semesters 1, 3, 5, 7 (6 + 6 + 7 + 6) ->
  37 planned sections across 6 cohorts ("grupos"): 1A, 1B, 3A, 3B, 5A, 7A.
  Semester-1 and semester-3 courses have one section per cohort (2 each);
  semester-5/7 courses have a single section. 6*2 + 6*2 + 7 + 6 = 37.
* 14 full-time professors: qualified courses (with a "primary" subset),
  min/max teaching hours, preferred and unavailable meeting patterns.
* 5 adjunct instructors: cost per section, 2-week hiring lead time, only
  available in evening blocks (they work in industry).
* 10 rooms, 3 of them computer labs.
* 14 meeting patterns = {Mon-Wed, Tue-Thu} x 7 two-hour blocks 07:00-21:00.
* 5 years (2021-2025) of historical enrollment per course.

Ground truth vs. what the department sees
------------------------------------------
Each course has a latent mean demand that follows a trend. History is drawn
from it with noise. The *true* 2026 mean (``true_mean_2026``) is stored so
the Phase-2 simulator can draw realistic demand, but NO policy reads it --
policies only see the history-based forecast (see ``forecast.py``).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import DATA_DIR, GENERATOR_SEED

BLOCKS = ["07:00", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00"]
DAYPAIRS = ["MW", "TT"]  # Mon-Wed, Tue-Thu

# (code, name_en, name_es, semester, area, lab_required)
COURSES = [
    ("FE101", "Calculus I", "Cálculo I", 1, "math", False),
    ("FE102", "Linear Algebra", "Álgebra Lineal", 1, "math", False),
    ("FE103", "Introduction to Finance", "Introducción a las Finanzas", 1, "fin", False),
    ("FE104", "Principles of Economics", "Principios de Economía", 1, "econ", False),
    ("FE105", "Programming for Finance I", "Programación para Finanzas I", 1, "prog", True),
    ("FE106", "Financial Accounting", "Contabilidad Financiera", 1, "fin", False),
    ("FE301", "Probability Theory", "Teoría de la Probabilidad", 3, "math", False),
    ("FE302", "Statistics for Finance", "Estadística para Finanzas", 3, "math", False),
    ("FE303", "Corporate Finance", "Finanzas Corporativas", 3, "fin", False),
    ("FE304", "Microeconomics", "Microeconomía", 3, "econ", False),
    ("FE305", "Programming for Finance II", "Programación para Finanzas II", 3, "prog", True),
    ("FE306", "Differential Equations", "Ecuaciones Diferenciales", 3, "math", False),
    ("FE501", "Stochastic Processes", "Procesos Estocásticos", 5, "math", False),
    ("FE502", "Econometrics", "Econometría", 5, "econ", True),
    ("FE503", "Fixed Income Securities", "Instrumentos de Renta Fija", 5, "fin", False),
    ("FE504", "Derivatives and Options Pricing", "Derivados y Valuación de Opciones", 5, "fin", False),
    ("FE505", "Numerical Methods for Finance", "Métodos Numéricos para Finanzas", 5, "prog", True),
    ("FE506", "Portfolio Theory", "Teoría de Portafolios", 5, "fin", False),
    ("FE507", "Optimization Methods", "Métodos de Optimización", 5, "math", False),
    ("FE701", "Stochastic Calculus", "Cálculo Estocástico", 7, "math", False),
    ("FE702", "Financial Risk Management", "Administración de Riesgos Financieros", 7, "fin", False),
    ("FE703", "Machine Learning in Finance", "Aprendizaje Automático en Finanzas", 7, "prog", True),
    ("FE704", "Algorithmic Trading", "Trading Algorítmico", 7, "prog", True),
    ("FE705", "Credit Risk Modeling", "Modelación de Riesgo de Crédito", 7, "fin", False),
    ("FE706", "Sequential Decision Analytics", "Analítica de Decisiones Secuenciales", 7, "math", False),
]

COHORTS = {1: ["1A", "1B"], 3: ["3A", "3B"], 5: ["5A"], 7: ["7A"]}

# (id, name, capacity, is_lab)
ROOMS = [
    ("A-101", "Auditorium A-101", 60, False),
    ("A-102", "Room A-102", 52, False),
    ("A-201", "Room A-201", 46, False),
    ("A-202", "Room A-202", 40, False),
    ("B-101", "Room B-101", 40, False),
    ("B-102", "Room B-102", 36, False),
    ("B-201", "Seminar B-201", 30, False),
    ("LAB-1", "Computer Lab 1", 48, True),
    ("LAB-2", "Computer Lab 2", 40, True),
    ("LAB-3", "Computer Lab 3", 30, True),
]

# 14 synthetic full-time professors: (id, name, area, secondary_area)
PROFESSORS = [
    ("P01", "Dr. Ana Ramírez", "math", "prog"),
    ("P02", "Dr. Luis Herrera", "math", None),
    ("P03", "Dr. Sofía Navarro", "math", "econ"),
    ("P04", "Dr. Diego Castañeda", "math", None),
    ("P05", "Dr. Mariana Ortega", "fin", None),
    ("P06", "Dr. Javier Molina", "fin", "econ"),
    ("P07", "Dr. Valeria Cruz", "fin", None),
    ("P08", "Dr. Andrés Salgado", "fin", "math"),
    ("P09", "Dr. Paula Medina", "econ", "fin"),
    ("P10", "Dr. Ricardo Fuentes", "econ", "math"),
    ("P11", "Dr. Elena Vargas", "prog", None),
    ("P12", "Dr. Tomás Aguilar", "prog", "math"),
    ("P13", "Dr. Camila Reyes", "prog", "fin"),
    ("P14", "Dr. Héctor Ibarra", "prog", None),
]

ADJUNCTS = [
    ("J1", "M.Sc. Carlos Peña (quant desk)", ["fin", "prog"]),
    ("J2", "M.Sc. Lucía Torres (risk consultant)", ["fin"]),
    ("J3", "M.Sc. Omar Delgado (data scientist)", ["prog", "math"]),
    ("J4", "Lic. Fernanda Ríos (central bank economist)", ["econ", "fin"]),
    ("J5", "M.Sc. Iván Zamora (actuary)", ["math"]),
]

HIST_YEARS = [2021, 2022, 2023, 2024, 2025]


def pattern_table() -> pd.DataFrame:
    rows = []
    for d, dp in enumerate(DAYPAIRS):
        for b, start in enumerate(BLOCKS):
            end = f"{int(start[:2]) + 2:02d}:00"
            rows.append({"pattern": d * len(BLOCKS) + b, "daypair": dp, "block": b,
                         "start": start, "end": end,
                         "label": f"{'Mon-Wed' if dp == 'MW' else 'Tue-Thu'} {start}-{end}"})
    return pd.DataFrame(rows)


def generate(seed: int = GENERATOR_SEED, out_dir: Path = DATA_DIR) -> None:
    rng = np.random.default_rng(seed)
    out_dir.mkdir(parents=True, exist_ok=True)
    patterns = pattern_table()
    n_pat = len(patterns)

    # ---------- courses + historical enrollment ----------
    base_by_sem = {1: (74, 84), 3: (58, 70), 5: (28, 38), 7: (18, 32)}
    course_rows, hist_rows = [], []
    for code, en, es, sem, area, lab in COURSES:
        lo, hi = base_by_sem[sem]
        level_2021 = rng.uniform(lo, hi) * (0.9 if lab and sem >= 5 else 1.0)
        growth = rng.uniform(-0.02, 0.06) if sem < 7 else rng.uniform(-0.06, 0.12)
        noise = rng.uniform(0.04, 0.09) if sem < 5 else rng.uniform(0.08, 0.15)
        for i, y in enumerate(HIST_YEARS):
            mean = level_2021 * (1 + growth) ** i
            obs = int(max(5, round(mean * np.exp(rng.normal(0, noise) - noise**2 / 2))))
            hist_rows.append({"course": code, "year": y, "enrolled": obs})
        true_2026 = level_2021 * (1 + growth) ** 5
        course_rows.append({
            "course": code, "name_en": en, "name_es": es, "semester": sem, "area": area,
            "lab_required": lab, "n_sections": len(COHORTS[sem]),
            "true_mean_2026": round(true_2026, 2),  # simulator ground truth only
        })
    courses = pd.DataFrame(course_rows)
    hist = pd.DataFrame(hist_rows)

    # ---------- sections ----------
    sec_rows = []
    for _, c in courses.iterrows():
        for coh in COHORTS[int(c.semester)]:
            sec_rows.append({"section": f"{c.course}-{coh}", "course": c.course, "cohort": coh})
    sections = pd.DataFrame(sec_rows)
    assert len(courses) == 25 and len(sections) == 37

    # ---------- rooms ----------
    rooms = pd.DataFrame([{"room": r, "name": n, "capacity": cap, "is_lab": lab}
                          for r, n, cap, lab in ROOMS])

    # ---------- full-time professors ----------
    area_courses = {a: [c[0] for c in COURSES if c[4] == a] for a in ["math", "fin", "econ", "prog"]}
    profs = []
    for pid, name, area, sec_area in PROFESSORS:
        own = area_courses[area]
        k = max(3, int(round(len(own) * rng.uniform(0.55, 0.8))))
        qual = list(rng.choice(own, size=min(k, len(own)), replace=False))
        if sec_area:
            other = [c for c in area_courses[sec_area] if c not in qual]
            qual += list(rng.choice(other, size=min(2, len(other)), replace=False))
        primary = list(rng.choice(qual, size=min(3, len(qual)), replace=False))
        max_sections = int(rng.choice([3, 3, 4]))
        min_sections = int(rng.choice([1, 2, 2]))
        unavailable = sorted(int(x) for x in rng.choice(n_pat, size=int(rng.integers(2, 5)), replace=False))
        avail = [k_ for k_ in range(n_pat) if k_ not in unavailable]
        preferred = sorted(int(x) for x in rng.choice(avail, size=int(rng.integers(3, 5)), replace=False))
        profs.append({"id": pid, "name": name, "area": area,
                      "qualified": sorted(str(q) for q in qual), "primary": sorted(str(p) for p in primary),
                      "min_hours": 4 * min_sections, "max_hours": 4 * max_sections,
                      "preferred_patterns": preferred, "unavailable_patterns": unavailable})

    # guarantee every course has >= 2 qualified full-time professors
    for code, *_rest in COURSES:
        area = _rest[3]
        q = [p for p in profs if code in p["qualified"]]
        while len(q) < 2:
            cands = [p for p in profs if p["area"] == area and code not in p["qualified"]]
            p = cands[int(rng.integers(len(cands)))] if cands else profs[int(rng.integers(len(profs)))]
            p["qualified"] = sorted(p["qualified"] + [code])
            q = [p for p in profs if code in p["qualified"]]

    # ---------- adjuncts ----------
    evening = [int(p) for p in patterns.query("block >= 5").pattern]
    adjuncts = []
    for aid, name, areas in ADJUNCTS:
        pool = [c for a in areas for c in area_courses[a]]
        qual = sorted(str(x) for x in rng.choice(pool, size=min(len(pool), int(rng.integers(4, 7))), replace=False))
        adjuncts.append({"id": aid, "name": name, "qualified": qual,
                         "cost_per_section": int(round(rng.uniform(3200, 4800), -1)),
                         "lead_time_weeks": 2, "max_sections": 2,
                         "available_patterns": evening})
    for code, *_rest in COURSES:  # >= 1 adjunct option for every course
        if not any(code in a["qualified"] for a in adjuncts):
            a = adjuncts[int(rng.integers(len(adjuncts)))]
            a["qualified"] = sorted(a["qualified"] + [code])

    # ---------- write ----------
    courses.to_csv(out_dir / "courses.csv", index=False)
    sections.to_csv(out_dir / "sections.csv", index=False)
    rooms.to_csv(out_dir / "rooms.csv", index=False)
    patterns.to_csv(out_dir / "patterns.csv", index=False)
    hist.to_csv(out_dir / "enrollment_history.csv", index=False)
    (out_dir / "professors.json").write_text(json.dumps(profs, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "adjuncts.json").write_text(json.dumps(adjuncts, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "meta.json").write_text(json.dumps({
        "synthetic": True, "generator_seed": seed,
        "note": "Synthetic instance generated per the assignment specification "
                "(official course files were not provided). Regenerate with "
                "`python -m app.data.generator`.",
        "cohorts": COHORTS, "blocks": BLOCKS, "daypairs": DAYPAIRS,
        "hours_per_section": 4, "history_years": HIST_YEARS,
    }, indent=2), encoding="utf-8")


if __name__ == "__main__":
    generate()
    print(f"wrote synthetic instance to {DATA_DIR}")
