from __future__ import annotations

import json
import os
import time
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ..config import RESULTS_DIR, SAMPLE_SCENARIO_SEED, credential_status
from ..data.instance import load_instance
from ..evaluation.evaluate import eval_seeds, paired, run_many, summarize
from ..phase1.model import EDGE_BLOCKS
from ..phase1.run import get_phase1, get_timetable
from ..phase1.solver import HAVE_GUROBI
from ..policies import POLICY_INFO, POLICY_ORDER, make_policy
from ..policies.rl import ACTION_NAMES, load_q, policy_summary
from ..simulator.env import RegistrationEnv
from ..simulator.params import ARRIVAL_PROFILE, CANCEL_FROM_WEEK, N_WEEKS, Settings
from ..simulator.scenario import make_scenario

app = FastAPI(title="Course scheduling under uncertain enrollment", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _clean(x):
    """Make numpy scalars/arrays and NaN JSON-safe."""
    if isinstance(x, dict):
        return {str(k): _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if isinstance(x, np.ndarray):
        return _clean(x.tolist())
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating, float)):
        f = float(x)
        return None if (np.isnan(f) or np.isinf(f)) else f
    if isinstance(x, (np.bool_,)):
        return bool(x)
    return x


# ------------------------------------------------------------------ static data
@app.get("/api/health")
def health():
    return {"status": "ok", "credentials": credential_status(), "gurobipy_installed": HAVE_GUROBI,
            "results_available": (RESULTS_DIR / "evaluation.json").is_file()}


@lru_cache(maxsize=1)
def _instance_payload() -> dict:
    inst = load_instance()
    fc = inst.forecast_table.set_index("course")
    hist = inst.history
    courses = []
    for c in inst.courses:
        f = fc.loc[c.code]
        courses.append({
            "idx": c.idx, "code": c.code, "name_en": c.name_en, "name_es": c.name_es, "semester": c.semester,
            "area": c.area, "lab": c.lab, "n_sections": c.n_sections, "forecast": c.forecast,
            "sigma_rel": c.sigma_rel, "slope": float(f.slope),
            "history": hist[hist.course == c.code].sort_values("year")[["year", "enrolled"]].to_dict("records"),
            "backtest_pred": float(f.backtest_pred_2025), "backtest_ape": float(f.backtest_ape),
            "naive_ape": float(f.naive_ape), "mean_ape": float(f.mean_ape),
            "qualified_profs": [p.idx for p in inst.profs if c.idx in p.qualified],
            "qualified_adjuncts": [a.idx for a in inst.adjuncts if c.idx in a.qualified],
        })
    return _clean({
        "meta": inst.meta, "source": "synthetic" if inst.meta.get("synthetic") else "provided",
        "courses": courses,
        "sections": [{"idx": s.idx, "sid": s.sid, "course": s.course, "cohort": s.cohort, "forecast": s.forecast}
                     for s in inst.sections],
        "profs": [{"idx": p.idx, "pid": p.pid, "name": p.name, "area": p.area, "qualified": sorted(p.qualified),
                   "primary": sorted(p.primary), "min_hours": 4 * p.min_sections, "max_hours": 4 * p.max_sections,
                   "preferred": sorted(p.preferred), "unavailable": sorted(p.unavailable)} for p in inst.profs],
        "adjuncts": [{"idx": a.idx, "aid": a.aid, "name": a.name, "qualified": sorted(a.qualified),
                      "cost_per_section": a.cost_per_section, "lead_time": a.lead_time,
                      "max_sections": a.max_sections, "available": sorted(a.available)} for a in inst.adjuncts],
        "rooms": [{"idx": r.idx, "rid": r.rid, "name": r.name, "capacity": r.capacity, "is_lab": r.is_lab}
                  for r in inst.rooms],
        "patterns": inst.patterns.to_dict("records"),
        "cohorts": inst.cohorts,
        "params": {"settings": Settings().as_dict(), "arrival_profile": list(ARRIVAL_PROFILE), "n_weeks": N_WEEKS,
                   "cancel_from_week": CANCEL_FROM_WEEK, "edge_blocks": sorted(EDGE_BLOCKS)},
        "totals": {"forecast_students": float(sum(c.forecast for c in inst.courses)),
                   "ft_section_capacity": int(sum(p.max_sections for p in inst.profs)),
                   "ft_min_sections": int(sum(p.min_sections for p in inst.profs))},
    })


@app.get("/api/instance")
def instance():
    return _instance_payload()


@app.get("/api/phase1")
def phase1():
    return _clean(get_phase1())


@lru_cache(maxsize=1)
def _results() -> dict:
    f = RESULTS_DIR / "evaluation.json"
    if not f.is_file():
        raise HTTPException(503, "results not computed yet: run `python -m scripts.precompute`")
    out = json.loads(f.read_text(encoding="utf-8"))
    Q, meta, visits = load_q()
    out["rl_policy_map"] = policy_summary(Q, visits)
    out["rl_actions"] = ACTION_NAMES
    return _clean(out)


@app.get("/api/results")
def results():
    return _results()


# ------------------------------------------------------------------ live endpoints
class Inputs(BaseModel):
    penalty_unserved: float | None = Field(None, ge=0, le=20000)
    penalty_change: float | None = Field(None, ge=0, le=5000)
    demand_multiplier: float | None = Field(None, ge=0.5, le=1.8)
    demand_volatility: float | None = Field(None, ge=0.0, le=0.8)
    unavailability_prob: float | None = Field(None, ge=0.0, le=0.2)
    budget: float | None = Field(None, ge=0, le=200000)
    N: int | None = Field(None, ge=0, le=60)
    M: int | None = Field(None, ge=0, le=60)
    theta: float | None = Field(None, ge=0.5, le=2.0)


class EpisodeRequest(Inputs):
    policy: str = "dla"
    seed: int | None = None


class EvaluateRequest(Inputs):
    n_scenarios: int = Field(40, ge=5, le=200)
    policies: list[str] = Field(default_factory=lambda: list(POLICY_ORDER))


def _specs(req: Inputs) -> dict[str, dict]:
    try:
        best = _results()
        tuned = {p["name"]: p["params"] for p in best["policies"]}
    except HTTPException:
        tuned = {"pfa": {"N": 0, "M": 12}, "dla": {"theta": 1.2}}
    pfa = dict(tuned.get("pfa", {}))
    if req.N is not None:
        pfa["N"] = req.N
    if req.M is not None:
        pfa["M"] = req.M
    dla = dict(tuned.get("dla", {}))
    if req.theta is not None:
        dla["theta"] = req.theta
    return {"baseline": {}, "pfa": pfa, "dla": dla, "rl": {}}


def _settings(req: Inputs) -> Settings:
    return Settings().with_overrides(**req.model_dump(exclude={"N", "M", "theta", "policy", "seed", "n_scenarios", "policies"}))


@lru_cache(maxsize=64)
def _episode_cached(key: str) -> dict:
    req = EpisodeRequest.model_validate_json(key)
    if req.policy not in POLICY_INFO:
        raise HTTPException(404, f"unknown policy {req.policy}")
    inst = load_instance()
    S = _settings(req)
    seed = SAMPLE_SCENARIO_SEED if req.seed is None else int(req.seed)
    spec = _specs(req)[req.policy]
    scn = make_scenario(inst, seed, S.scen)
    env = RegistrationEnv(inst, get_timetable(), scn, S, record=True)
    t0 = time.perf_counter()
    out = env.run(make_policy(req.policy, **spec))
    return _clean({"policy": req.policy, "params": spec, "seed": seed, "settings": S.as_dict(),
                   "outcome": out, "weeks": env.log.weeks, "seconds": time.perf_counter() - t0,
                   "demand": scn.demand.tolist(), "fingerprint": scn.fingerprint()})


@app.post("/api/episode")
def episode(req: EpisodeRequest):
    return _episode_cached(req.model_dump_json())


@app.post("/api/evaluate")
def evaluate(req: EvaluateRequest):
    bad = [p for p in req.policies if p not in POLICY_INFO]
    if bad:
        raise HTTPException(404, f"unknown policies {bad}")
    S = _settings(req)
    specs = _specs(req)
    seeds = eval_seeds(req.n_scenarios)
    t0 = time.perf_counter()
    # in-process: for <= 200 scenarios this beats spawning a process pool per request
    rows = {p: run_many((p, specs[p]), seeds, S, workers=1) for p in req.policies}
    out = []
    for p in req.policies:
        sm = summarize(rows[p])
        out.append({"name": p, "class": POLICY_INFO[p]["class"], "label": POLICY_INFO[p]["label"],
                    "params": specs[p], "stats": sm})
    best = min(out, key=lambda r: r["stats"]["total_cost"]["mean"])["name"]
    return _clean({
        "live": True, "n_scenarios": req.n_scenarios, "seconds": time.perf_counter() - t0,
        "settings": S.as_dict(), "policies": out, "best": best,
        "paired_vs_best": {p: paired(rows[p], rows[best]) for p in req.policies if p != best},
        "scenarios": {p: {"total_cost": [r["total_cost"] for r in rows[p]], "unserved": [r["unserved"] for r in rows[p]]}
                      for p in req.policies},
    })


# ------------------------------------------------------------------ static frontend
FRONTEND_DIST = os.environ.get("FRONTEND_DIST")
if FRONTEND_DIST and Path(FRONTEND_DIST).is_dir():
    dist = Path(FRONTEND_DIST)
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        f = dist / full_path
        if full_path and f.is_file():
            return FileResponse(f)
        return FileResponse(dist / "index.html")
