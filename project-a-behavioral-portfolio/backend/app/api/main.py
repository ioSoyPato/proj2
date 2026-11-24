"""FastAPI app: the JSON API under /api/... and the built frontend at /.

Endpoints
  GET  /api/health          liveness + which MILP solver is active
  GET  /api/meta            dataset metadata, questionnaire spec, seeds and defaults
  GET  /api/default         precomputed full analysis for the default profile (instant)
  POST /api/profile         questionnaire answers -> prospect-theory profile (fast)
  POST /api/portfolio       answers + constraints -> MILP portfolio + frontier (fast)
  POST /api/analyze         answers + settings -> full live re-run (a few seconds)
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
import threading

from .. import config
from ..data.loader import load_market_data
from ..evaluation.runner import (
    DEFAULT_CFA, Settings, frontier, jsonable, milp_params, portfolio_payload, run_analysis,
)
from ..optimization.milp import solve_portfolio
from ..optimization.solver import active_solver_name, gurobi_status
from ..profile.questionnaire import QUESTIONS, cvar_cap_from_lambda, estimate_profile, risk_label, value_function
from .schemas import AnalyzeRequest, ProfileRequest

app = FastAPI(title="Behavior Gap - behavioural portfolio advisor", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_RUN_LOCK = threading.Lock()  # one heavy simulation at a time (the CFA uses a process pool)


@lru_cache(maxsize=1)
def _precomputed() -> dict | None:
    p = config.DATA_DIR / "precomputed_default.json"
    return json.loads(p.read_text()) if p.is_file() else None


def _tuned_cfa() -> dict:
    pre = _precomputed()
    return dict(pre["tuning"]["cfa_selected"]) if pre else dict(DEFAULT_CFA)


def _settings(req: AnalyzeRequest) -> Settings:
    return Settings(
        initial_wealth=req.initial_wealth, target_growth=req.target_growth,
        max_assets=req.max_assets, max_weight=req.max_weight, max_class_weight=req.max_class_weight,
        cost=req.cost_bp / 10_000, n_eval=req.n_scenarios, cfa=_tuned_cfa(),
        cvar_cap_override=req.cvar_cap_override,
    )


@app.get("/api/health")
def health():
    return {"ok": True, "solver": active_solver_name(), "gurobi": gurobi_status(),
            "precomputed": _precomputed() is not None}


@app.get("/api/meta")
def meta():
    md = load_market_data()
    return jsonable({
        "data": {**md.meta, "classes": md.classes},
        "questions": [asdict(q) for q in QUESTIONS],
        "seeds": {"tuning": config.TUNING_SEED, "evaluation": config.EVAL_SEED,
                  "sensitivity": config.SENSITIVITY_SEED},
        "defaults": {**asdict(Settings()), "cost_bp": config.TRANSACTION_COST * 10_000},
        "solver": active_solver_name(),
        "cfa_tuned": _tuned_cfa(),
    })


@app.get("/api/default")
def default_analysis():
    pre = _precomputed()
    if pre is None:
        raise HTTPException(503, "precomputed_default.json missing: run `python -m scripts.precompute`")
    return pre


@app.post("/api/profile")
def profile(req: ProfileRequest):
    prof = estimate_profile(req.answers)
    import numpy as np

    xs = np.linspace(-0.5, 0.5, 101)
    return jsonable({**prof.to_dict(), "risk_label": risk_label(prof.lam), "cvar_cap": cvar_cap_from_lambda(prof.lam),
                     "value_curve": {"x": xs, "v": value_function(xs, prof.alpha, prof.beta, prof.lam)}})


@app.post("/api/portfolio")
def portfolio(req: AnalyzeRequest):
    md = load_market_data()
    s = _settings(req)
    prof = estimate_profile(req.answers)
    mp = milp_params(prof, s)
    res = solve_portfolio(md.returns, md.class_matrix(), mp)
    return jsonable({"portfolio": portfolio_payload(md, res, mp, s), "frontier": frontier(md, mp)})


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    s = _settings(req)

    def work():
        with _RUN_LOCK:
            return jsonable(run_analysis(req.answers, s))

    try:
        return await run_in_threadpool(work)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"{type(exc).__name__}: {exc}") from exc


_frontend_dist = Path(os.environ.get("FRONTEND_DIST", "/app/frontend_dist"))
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
