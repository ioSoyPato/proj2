"""Full pipeline -> committed JSON the dashboard loads instantly.

    cd backend && .venv/bin/python -m scripts.precompute            # everything (~10-15 min)
    cd backend && .venv/bin/python -m scripts.precompute --skip-train  # reuse shipped Q-table

Steps
  1. Phase 1 MILP (monolithic HiGHS + decomposed Gurobi/HiGHS)  -> results/phase1.json
  2. RL training on TRAINING seeds                               -> policies/trained/q_table.json
  3. PFA grid search (N, M) and DLA theta search on TUNING seeds
  4. Final evaluation on >= 500 EVALUATION seeds, all policies, CRN
  5. One-factor-at-a-time sensitivity analysis on evaluation seeds
                                                                 -> results/evaluation.json
"""
from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone

import numpy as np

from app.config import EVAL_SEED_BASE, RESULTS_DIR, TRAIN_SEED_BASE, TUNE_SEED_BASE
from app.data.instance import load_instance
from app.evaluation.evaluate import eval_seeds, paired, run_many, summarize, tuning_seeds
from app.phase1.run import get_timetable, solve_and_save
from app.policies import POLICY_INFO, POLICY_ORDER, make_policy
from app.policies.rl import load_q, save_q, train
from app.simulator.env import RegistrationEnv
from app.simulator.params import Settings
from app.simulator.scenario import make_scenario

PFA_N = [0, 2, 4, 6, 8, 12, 16]
PFA_M = [0, 5, 8, 12, 16]
DLA_THETA = [0.9, 1.0, 1.1, 1.2, 1.35]
SENSITIVITY = {
    "penalty_unserved": [400, 800, 1200, 2400],
    "demand_multiplier": [0.85, 1.0, 1.15, 1.3],
    "demand_volatility": [0.1, 0.2, 0.35],
    "unavailability_prob": [0.0, 0.01, 0.03, 0.05],
    "budget": [0, 8000, 20000],
}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-eval", type=int, default=500)
    ap.add_argument("--n-tune-pfa", type=int, default=200)
    ap.add_argument("--n-tune-dla", type=int, default=100)
    ap.add_argument("--n-sens", type=int, default=150)
    ap.add_argument("--rl-episodes", type=int, default=15000)
    ap.add_argument("--skip-train", action="store_true")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    a = ap.parse_args()
    W = a.workers
    T0 = time.perf_counter()
    S = Settings()
    timing: dict[str, float] = {}

    log("phase 1 ...")
    t = time.perf_counter(); p1 = solve_and_save(); timing["phase1"] = time.perf_counter() - t
    log(f"  monolithic {p1['monolithic']['result']['solver']} obj={p1['monolithic']['result']['objective']:.2f}")
    inst, tt = load_instance(), get_timetable()

    if not a.skip_train:
        log(f"RL training ({a.rl_episodes} episodes, training seeds) ...")
        t = time.perf_counter(); Q, meta = train(inst, tt, S, episodes=a.rl_episodes, log_every=250)
        save_q(Q, meta); timing["rl_train"] = time.perf_counter() - t
    _, rl_meta, _ = load_q()

    log("PFA grid on tuning seeds ...")
    t = time.perf_counter()
    seeds_p = tuning_seeds(a.n_tune_pfa)
    pfa_grid = []
    for N in PFA_N:
        for M in PFA_M:
            rows = run_many(("pfa", {"N": N, "M": M}), seeds_p, S, W)
            sm = summarize(rows)
            pfa_grid.append({"N": N, "M": M, "mean_cost": sm["total_cost"]["mean"], "ci_half": sm["total_cost"]["ci_hi"] - sm["total_cost"]["mean"],
                             "mean_unserved": sm["unserved"]["mean"], "mean_changed": sm["changed"]["mean"]})
    best_pfa = min(pfa_grid, key=lambda r: r["mean_cost"])
    timing["pfa_tuning"] = time.perf_counter() - t
    log(f"  best PFA N={best_pfa['N']} M={best_pfa['M']} cost={best_pfa['mean_cost']:.0f}")

    log("DLA theta on tuning seeds ...")
    t = time.perf_counter()
    seeds_d = tuning_seeds(a.n_tune_dla)
    dla_grid = []
    for th in DLA_THETA:
        sm = summarize(run_many(("dla", {"theta": th}), seeds_d, S, W))
        dla_grid.append({"theta": th, "mean_cost": sm["total_cost"]["mean"], "ci_half": sm["total_cost"]["ci_hi"] - sm["total_cost"]["mean"],
                         "mean_unserved": sm["unserved"]["mean"], "mean_changed": sm["changed"]["mean"]})
    best_dla = min(dla_grid, key=lambda r: r["mean_cost"])
    timing["dla_tuning"] = time.perf_counter() - t
    log(f"  best DLA theta={best_dla['theta']} cost={best_dla['mean_cost']:.0f}")

    specs = {"baseline": {}, "pfa": {"N": best_pfa["N"], "M": best_pfa["M"]}, "dla": {"theta": best_dla["theta"]}, "rl": {}}

    log(f"final evaluation on {a.n_eval} evaluation seeds ...")
    t = time.perf_counter()
    seeds_e = eval_seeds(a.n_eval)
    rows = {}
    for name in POLICY_ORDER:
        t1 = time.perf_counter()
        rows[name] = run_many((name, specs[name]), seeds_e, S, W)
        log(f"  {name}: {np.mean([r['total_cost'] for r in rows[name]]):.0f} ({time.perf_counter() - t1:.0f}s)")
    timing["final_eval"] = time.perf_counter() - t
    fps = {n: [r["fingerprint"] for r in rows[n]] for n in rows}
    crn_ok = all(fps[n] == fps["baseline"] for n in fps)

    policies = []
    for name in POLICY_ORDER:
        policies.append({"name": name, "class": POLICY_INFO[name]["class"], "label": POLICY_INFO[name]["label"],
                         "params": specs[name], "stats": summarize(rows[name])})
    best = min(policies, key=lambda p: p["stats"]["total_cost"]["mean"])
    pair = {n: paired(rows[n], rows[best["name"]]) for n in POLICY_ORDER if n != best["name"]}
    pair_unserved = {n: paired(rows[n], rows[best["name"]], "unserved") for n in POLICY_ORDER if n != best["name"]}

    # DLA solve statistics (in-process, on a few evaluation seeds)
    dla_stats = []
    for s in seeds_e[:30]:
        pol = make_policy("dla", **specs["dla"])
        RegistrationEnv(inst, tt, make_scenario(inst, s, S.scen), S).run(pol)
        dla_stats += pol.solve_stats
    dla_solve = {"n_solves": len(dla_stats), "mean_seconds": float(np.mean([d["seconds"] for d in dla_stats])),
                 "max_seconds": float(np.max([d["seconds"] for d in dla_stats])),
                 "mean_vars": float(np.mean([d["n_vars"] for d in dla_stats])),
                 "max_vars": int(np.max([d["n_vars"] for d in dla_stats])),
                 "optimal_share": float(np.mean([d["status"] == "optimal" for d in dla_stats]))}

    log(f"sensitivity ({a.n_sens} evaluation seeds per setting) ...")
    t = time.perf_counter()
    seeds_s = eval_seeds(a.n_sens)
    sens = []
    for factor, values in SENSITIVITY.items():
        for v in values:
            Sv = S.with_overrides(**{factor: v})
            entry = {"factor": factor, "value": v, "is_base": bool(v == S.as_dict()["cost" if factor in S.as_dict()["cost"] else "scen"][factor]),
                     "policies": []}
            srows = {}
            for name in POLICY_ORDER:
                srows[name] = run_many((name, specs[name]), seeds_s, Sv, W)
                sm = summarize(srows[name])
                entry["policies"].append({"name": name, "mean_cost": sm["total_cost"]["mean"],
                                          "ci_lo": sm["total_cost"]["ci_lo"], "ci_hi": sm["total_cost"]["ci_hi"],
                                          "mean_unserved": sm["unserved"]["mean"], "mean_changed": sm["changed"]["mean"]})
            ranked = sorted(entry["policies"], key=lambda p: p["mean_cost"])
            entry["best"] = ranked[0]["name"]
            entry["runner_up"] = ranked[1]["name"]
            pd_ = paired(srows[ranked[1]["name"]], srows[ranked[0]["name"]])
            entry["gap_to_runner_up"] = {"mean": pd_["mean"], "ci_lo": pd_["ci_lo"], "ci_hi": pd_["ci_hi"]}
            entry["significant"] = bool(pd_["ci_lo"] > 0)
            sens.append(entry)
            log(f"  {factor}={v}: best={entry['best']}")
    timing["sensitivity"] = time.perf_counter() - t

    out = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "n_eval": a.n_eval, "n_tune_pfa": a.n_tune_pfa, "n_tune_dla": a.n_tune_dla, "n_sens": a.n_sens,
            "seed_ranges": {"training": [TRAIN_SEED_BASE, TRAIN_SEED_BASE + int(rl_meta.get("episodes", 0)) - 1],
                            "tuning": [TUNE_SEED_BASE, TUNE_SEED_BASE + max(a.n_tune_pfa, a.n_tune_dla) - 1],
                            "evaluation": [EVAL_SEED_BASE, EVAL_SEED_BASE + a.n_eval - 1]},
            "crn_verified": crn_ok, "settings": S.as_dict(), "timing_seconds": timing,
            "total_seconds": time.perf_counter() - T0, "workers": W,
        },
        "tuning": {"pfa_grid": pfa_grid, "pfa_best": best_pfa, "dla_grid": dla_grid, "dla_best": best_dla,
                   "rl": {k: v for k, v in rl_meta.items() if k != "visits"}},
        "policies": policies,
        "best": best["name"],
        "paired_vs_best": pair,
        "paired_unserved_vs_best": pair_unserved,
        "dla_solve": dla_solve,
        "scenarios": {n: {"total_cost": [r["total_cost"] for r in rows[n]], "unserved": [r["unserved"] for r in rows[n]]}
                      for n in POLICY_ORDER},
        "sensitivity": sens,
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    (RESULTS_DIR / "evaluation.json").write_text(json.dumps(out, default=float), encoding="utf-8")
    log(f"done in {time.perf_counter() - T0:.0f}s -> {RESULTS_DIR / 'evaluation.json'}")


if __name__ == "__main__":
    main()
