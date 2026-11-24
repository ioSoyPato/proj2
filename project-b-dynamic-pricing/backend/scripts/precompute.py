"""Precompute the full evaluation for the default market (committed JSON).

    cd backend && python -m scripts.precompute                # ~10 min (DLA dominates)
    python -m scripts.precompute --n-eval 500 --n-sens 100    # faster

Order of operations:  tune (tuning seeds)  ->  evaluate (evaluation seeds,
common random numbers, >= 500 scenarios)  ->  sensitivity sweeps (own seeds).
Run ``python -m scripts.train_rl`` first so the RL agent is included.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time

from app.config import PRECOMPUTED_JSON
from app.evaluation.study import evaluate, sensitivity

# compact grid (keeps the precompute ~10 min on a laptop); --full-sweeps for the dense one
COMPACT_SWEEPS = {"eta": [0.1, 0.6, 2.5], "theta": [0.5, 0.8, 0.95],
                  "demand_scale": [0.7, 1.0, 1.3], "demand_sigma": [0.0, 0.4]}
from app.jsonutil import jsonable
from app.simulator.params import default_params, load_calibration


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n-eval", type=int, default=600)
    ap.add_argument("--n-tune", type=int, default=300)
    ap.add_argument("--n-tune-dla", type=int, default=100)
    ap.add_argument("--n-sens", type=int, default=60)
    ap.add_argument("--full-sweeps", action="store_true", help="denser sensitivity grid (slow)")
    ap.add_argument("--skip-sensitivity", action="store_true")
    args = ap.parse_args()
    if args.n_eval < 500:
        print("WARNING: the assignment requires >= 500 evaluation scenarios")
    t0 = time.time()
    params = default_params()
    cal = load_calibration()
    print(f"market: arrival shape from {params.arrival_shape_source} (b={params.arrival_decay:.4f})")
    res = evaluate(params, n_eval=args.n_eval, n_tune=args.n_tune, n_tune_dla=args.n_tune_dla, log=print)
    if not args.skip_sensitivity:
        tuned = {k: res["policies"][k]["tunables"] for k in ("pfa", "dla")}
        res["sensitivity"] = sensitivity(params, tuned, n=args.n_sens, log=print,
                                         sweeps=None if args.full_sweeps else COMPACT_SWEEPS)
    res["generated_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    res["total_seconds"] = round(time.time() - t0, 1)
    res["calibration"] = {"is_real_data": cal is not None,
                          "route": cal["provenance"]["route"] if cal else None,
                          "b": params.arrival_decay}
    PRECOMPUTED_JSON.parent.mkdir(parents=True, exist_ok=True)
    PRECOMPUTED_JSON.write_text(json.dumps(jsonable(res), separators=(",", ":")))
    print(f"saved {PRECOMPUTED_JSON}  ({res['total_seconds']}s)")


if __name__ == "__main__":
    main()
