from __future__ import annotations

import json
import os
import threading
import time
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from ..config import CALIBRATION_JSON, PRECOMPUTED_JSON, credential_status
from ..evaluation.study import SWEEPS, evaluate, load_rl, rl_status, sensitivity
from ..jsonutil import jsonable
from ..policies import dla as dla_mod
from ..policies.dla import Lookahead
from ..policies.rl import features
from ..policies.rules import FixedPrice, PriceSchedule, expected_cum_share
from ..simulator.demand import purchase_prob
from ..simulator.engine import State
from ..simulator.params import DEFAULT_ARRIVAL_DECAY, MarketParams, default_params, load_calibration
from .schemas import DecideIn, EvaluateIn, MarketIn, SweepIn

app = FastAPI(title="Dynamic ticket pricing — Powell framework", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# One heavy computation at a time (they already use every core).
_HEAVY = threading.Semaphore(1)


@lru_cache(maxsize=1)
def _precomputed_cached(mtime: float) -> dict | None:
    if not PRECOMPUTED_JSON.is_file():
        return None
    return json.loads(PRECOMPUTED_JSON.read_text())


def precomputed() -> dict | None:
    try:
        return _precomputed_cached(PRECOMPUTED_JSON.stat().st_mtime)
    except OSError:
        return None


def to_params(m: MarketIn) -> MarketParams:
    base = default_params()
    d = m.model_dump()
    decay = d.pop("arrival_decay")
    p = base.replace(**d, arrival_decay=base.arrival_decay if decay is None else decay,
                     arrival_shape_source=base.arrival_shape_source if decay is None else "user")
    try:
        p.validate()
    except ValueError as e:
        raise HTTPException(422, str(e))
    return p


def tuned_defaults() -> dict:
    pre = precomputed()
    if not pre:
        return {"pfa": None, "dla_n0": 300.0, "fixed": None}
    pol = pre["policies"]
    n0 = pol["dla"]["tunables"]["prior_n0"]
    return {"pfa": (pol["pfa"]["tunables"]["p0"], pol["pfa"]["tunables"]["drift"], pol["pfa"]["tunables"]["k"]),
            "dla_n0": float("inf") if n0 is None else n0, "fixed": pol["fixed"]["tunables"]["price"]}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    p = default_params()
    cal = load_calibration()
    pre = precomputed()
    rl_pol, rl_meta = load_rl()
    return jsonable({
        "defaults": p.to_dict() | {"arrival_decay": p.arrival_decay},
        "default_arrival_decay_uncalibrated": DEFAULT_ARRIVAL_DECAY,
        "grid": p.grid, "arrival_rates": p.arrival_rates(),
        "calibration": {"is_real_data": cal is not None,
                        "route": cal["provenance"]["route"] if cal else None,
                        "b": p.arrival_decay},
        "credentials": credential_status(),
        "solver": dla_mod.solver_info(),
        "rl": rl_status(p, rl_meta, rl_pol),
        "precomputed": {"available": pre is not None,
                        "generated_at": pre.get("generated_at") if pre else None,
                        "calibration_used": pre.get("calibration") if pre else None},
        "sweeps": SWEEPS,
    })


@app.get("/api/precomputed")
def get_precomputed():
    pre = precomputed()
    if pre is None:
        raise HTTPException(404, "precomputed.json missing — run `python -m scripts.precompute`")
    return pre


@app.get("/api/calibration")
def get_calibration():
    cal = load_calibration()
    if cal is None:
        return {"is_real_data": False, "default_b": DEFAULT_ARRIVAL_DECAY,
                "credentials": credential_status(),
                "how_to": "Fill KAGGLE_USERNAME/KAGGLE_KEY (or FLIGHT_PRICES_CSV) in credentials.env, then run "
                          "`cd backend && python -m scripts.calibrate && python -m scripts.train_rl && "
                          "python -m scripts.precompute`.",
                "file_present": CALIBRATION_JSON.is_file()}
    return cal


@lru_cache(maxsize=24)
def _evaluate_cached(key: str, n: int) -> dict:
    m = MarketIn.model_validate_json(key)
    params = to_params(m)
    td = tuned_defaults()
    t = time.time()
    res = evaluate(params, n_eval=n, n_tune=150, n_tune_dla=0, pfa_start=td["pfa"],
                   pfa_coarse=td["pfa"] is None, dla_n0=td["dla_n0"])
    res["live"] = True
    res["seconds"] = round(time.time() - t, 1)
    return jsonable(res)


@app.post("/api/evaluate")
def post_evaluate(body: EvaluateIn):
    with _HEAVY:
        return _evaluate_cached(body.market.model_dump_json(), body.n_scenarios)


@lru_cache(maxsize=16)
def _sweep_cached(key: str, parameter: str, n: int) -> dict:
    m = MarketIn.model_validate_json(key)
    params = to_params(m)
    td = tuned_defaults()
    base_vals = {"eta": [0.1, 0.3, 0.6, 1.0, 1.5, 2.5], "theta": [0.5, 0.65, 0.8, 0.9, 0.95],
                 "gamma": [0.0, 0.15, 0.3, 0.6, 1.0], "demand_scale": [0.7, 0.85, 1.0, 1.15, 1.3]}
    pfa = td["pfa"] or (float(np.median(params.grid)), 0.0, 400.0)
    tuned = {"pfa": {"p0": pfa[0], "drift": pfa[1], "k": pfa[2]},
             "dla": {"prior_n0": None if not np.isfinite(td["dla_n0"]) else td["dla_n0"]}}
    t = time.time()
    out = sensitivity(params, tuned, n=n, sweeps={parameter: base_vals[parameter]}, n_tune=100)
    out["live"] = True
    out["seconds"] = round(time.time() - t, 1)
    return jsonable(out)


@app.post("/api/sensitivity")
def post_sensitivity(body: SweepIn):
    with _HEAVY:
        return _sweep_cached(body.market.model_dump_json(), body.parameter, body.n_scenarios)


@app.post("/api/decide")
def post_decide(body: DecideIn):
    """Today's price under each policy for a promoter-supplied state."""
    params = to_params(body.market)
    s = body.state
    T, C = params.horizon, params.capacity
    if s.days_left > T:
        raise HTTPException(422, f"days_left must be ≤ selling window ({T})")
    if s.seats_left > C:
        raise HTTPException(422, f"seats_left must be ≤ capacity ({C})")
    t = T - s.days_left
    sold = C - s.seats_left
    exp_sold = sold / s.pace if sold > 0 else 0.0
    td = tuned_defaults()
    fixed_price = body.tuned.fixed_price or td["fixed"] or float(np.median(params.grid))
    pfa_p = body.tuned.pfa or (dict(zip(("p0", "drift", "k"), td["pfa"])) if td["pfa"] else
                               {"p0": float(np.median(params.grid)), "drift": 0.0, "k": 400.0})
    n0 = body.tuned.dla_n0 if body.tuned.dla_n0 is not None else td["dla_n0"]
    state = State(t=t, days_left=s.days_left, seats=np.array([s.seats_left]), ref=np.array([s.ref_price]),
                  last_sales=np.array([s.last_sales]), sold=np.array([sold]), exp_sold=np.array([exp_sold]))
    grid = params.grid
    out: dict = {"t": t, "days_left": s.days_left}
    fx = FixedPrice(fixed_price); fx.reset(params, 1)
    out["fixed"] = {"price": float(grid[fx.act(state, params)[0]])}
    pf = PriceSchedule(pfa_p["p0"], pfa_p["drift"], pfa_p["k"]); pf.reset(params, 1)
    out["pfa"] = {"price": float(grid[pf.act(state, params)[0]]), "params": pfa_p,
                  "booking_curve_target": float(C * expected_cum_share(params)[t])}
    lk = Lookahead(prior_n0=n0); lk.reset(params, 1)
    m_hat = lk.belief(float(sold), float(exp_sold))
    plan = lk.plan(t, float(s.seats_left), s.ref_price, m_hat, params)
    prices = grid[plan]
    r = dla_mod.ref_path(s.ref_price, prices, params.theta)
    lam = params.arrival_rates()[t:] * m_hat
    exp_sales = lam * purchase_prob(prices, r, params.eta, params.gamma, params.wtp_mu, params.wtp_sigma)
    rem, capped = float(s.seats_left), []
    for e in exp_sales:
        x = min(e, rem); capped.append(x); rem -= x
    out["dla"] = {"price": float(prices[0]), "plan": prices.tolist(), "expected_sales": capped,
                  "expected_revenue": float((prices * np.array(capped)).sum()), "demand_level_belief": m_hat,
                  "solver": dla_mod.solver_info()["preferred"]}
    rl_pol, rl_meta = load_rl()
    rls = rl_status(params, rl_meta, rl_pol)
    if rls["included"] and rl_pol is not None:
        rl_pol.reset(params, 1)
        q = rl_pol.q_values(features(state, params, expected_cum_share(params)))[0]
        out["rl"] = {"price": float(grid[int(q.argmax())]), "ood": rls["ood"]}
    else:
        out["rl"] = {"price": None, "ood": True, "reason": rls["reason"]}
    return jsonable(out)


# Serve the built frontend (single-image deployment).  Mounted last so every
# /api route wins; absent in local dev where Vite serves the UI.
_frontend_dist = Path(os.environ.get("FRONTEND_DIST", "/app/frontend_dist"))
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
