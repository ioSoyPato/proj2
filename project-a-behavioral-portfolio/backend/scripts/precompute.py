"""Precompute the full analysis for the default profile (tuning + 500-scenario
evaluation + sensitivity) and save it as JSON for instant load.

Usage (from ``backend/``)::

    .venv/bin/python -m scripts.precompute

Writes ``data/precomputed_default.json``. CFA parameters (lookback, theta) are
tuned here on the tuning seed and reused by the live endpoint.
"""
from __future__ import annotations

import json
import time

from app.config import DATA_DIR
from app.evaluation.runner import Settings, evaluate, jsonable, milp_params, run_analysis
from app.evaluation import sensitivity as sens
from app.data.loader import load_market_data
from app.optimization.milp import solve_portfolio
from app.profile.questionnaire import estimate_profile


def main() -> None:
    t0 = time.perf_counter()
    s = Settings(tune_cfa=True)
    out = run_analysis(None, s)
    print(f"main analysis {time.perf_counter() - t0:.1f}s; cfa={out['tuning']['cfa_selected']} "
          f"band={out['tuning']['band_selected']}", flush=True)

    s_live = Settings(cfa=out["tuning"]["cfa_selected"])
    band = out["tuning"]["band_selected"]

    # rebuild the evaluation results in memory for the reference sweep (same seed => same numbers)
    md = load_market_data()
    prof = estimate_profile(None)
    mp = milp_params(prof, s_live)
    x0 = solve_portfolio(md.returns, md.class_matrix(), mp).weights
    eval_res, _ = evaluate(md, prof, s_live, x0, mp, band, s_live.cfa, s_live.eval_seed, s_live.n_eval,
                           keep=("cfa_milp",))

    t = time.perf_counter()
    out["sensitivity"] = {
        "seed": s.eval_seed,
        "lambda": sens.lambda_sweep(None, s_live),
        "cost": sens.cost_sweep(None, s_live),
        "reference": sens.reference_sweep(None, s_live, eval_res),
        **sens.behavior_grids(None, s_live, band),
    }
    print(f"sensitivity {time.perf_counter() - t:.1f}s", flush=True)
    out["precomputed"] = True
    out["timings"]["precompute_total"] = time.perf_counter() - t0
    (DATA_DIR / "precomputed_default.json").write_text(json.dumps(jsonable(out), separators=(",", ":")))
    print(f"done in {time.perf_counter() - t0:.1f}s")


if __name__ == "__main__":
    main()
