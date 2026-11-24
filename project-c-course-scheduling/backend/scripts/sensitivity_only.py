"""Recompute only the sensitivity block of results/evaluation.json (keeps the main evaluation).

    cd backend && .venv/bin/python -m scripts.sensitivity_only --n-sens 150
"""
from __future__ import annotations

import argparse
import json
import os
import time

from app.config import RESULTS_DIR
from app.evaluation.evaluate import eval_seeds, paired, run_many, summarize
from app.policies import POLICY_ORDER
from app.simulator.params import Settings
from scripts.precompute import SENSITIVITY


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-sens", type=int, default=150)
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    a = ap.parse_args()
    f = RESULTS_DIR / "evaluation.json"
    out = json.loads(f.read_text(encoding="utf-8"))
    specs = {p["name"]: p["params"] for p in out["policies"]}
    S = Settings()
    base = S.as_dict()
    seeds = eval_seeds(a.n_sens)
    t0 = time.perf_counter()
    sens = []
    for factor, values in SENSITIVITY.items():
        for v in values:
            Sv = S.with_overrides(**{factor: v})
            grp = "cost" if factor in base["cost"] else "scen"
            entry = {"factor": factor, "value": v, "is_base": bool(v == base[grp][factor]), "policies": []}
            rows = {}
            for name in POLICY_ORDER:
                rows[name] = run_many((name, specs[name]), seeds, Sv, a.workers)
                sm = summarize(rows[name])
                entry["policies"].append({"name": name, "mean_cost": sm["total_cost"]["mean"], "ci_lo": sm["total_cost"]["ci_lo"],
                                          "ci_hi": sm["total_cost"]["ci_hi"], "mean_unserved": sm["unserved"]["mean"],
                                          "mean_changed": sm["changed"]["mean"]})
            ranked = sorted(entry["policies"], key=lambda p: p["mean_cost"])
            entry["best"], entry["runner_up"] = ranked[0]["name"], ranked[1]["name"]
            pd_ = paired(rows[ranked[1]["name"]], rows[ranked[0]["name"]])
            entry["gap_to_runner_up"] = {"mean": pd_["mean"], "ci_lo": pd_["ci_lo"], "ci_hi": pd_["ci_hi"]}
            entry["significant"] = bool(pd_["ci_lo"] > 0)
            sens.append(entry)
            print(f"{factor}={v}: best={entry['best']} sig={entry['significant']} ({time.perf_counter() - t0:.0f}s)", flush=True)
    out["sensitivity"] = sens
    out["meta"]["n_sens"] = a.n_sens
    out["meta"]["timing_seconds"]["sensitivity"] = time.perf_counter() - t0
    f.write_text(json.dumps(out, default=float), encoding="utf-8")
    print("saved")


if __name__ == "__main__":
    main()
