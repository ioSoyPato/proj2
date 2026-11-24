"""End-to-end study: tune on tuning seeds, evaluate on evaluation seeds (CRN),
summarise, recommend.  Used by ``scripts/precompute.py`` and the live API."""
from __future__ import annotations

import time
from dataclasses import asdict
from typing import Callable

import numpy as np

from ..config import RL_META_JSON, RL_WEIGHTS, SEED_EVAL, SEED_SENSITIVITY, SEED_TUNING
from ..policies import dla as dla_mod
from ..policies.dla import Lookahead
from ..policies.rl import DQNPolicy
from ..policies.rules import FixedPrice, PriceSchedule
from ..simulator.engine import SimResult, make_scenarios
from ..simulator.params import MarketParams
from .runner import paired, revenue_edges, run, histogram, summarize
from .tuning import tune_dla, tune_fixed, tune_pfa

POLICY_ORDER = ["fixed", "pfa", "dla", "rl"]       # also the simplicity order (simplest first)
POLICY_CLASS = {"fixed": "baseline", "pfa": "PFA", "dla": "DLA", "rl": "VFA"}

# Inputs the RL agent's training distribution depends on, with the relative
# change beyond which we flag it as out-of-distribution.
OOD_KEYS = ["capacity", "total_arrivals", "arrival_decay", "wtp_median", "wtp_sigma", "ref_init",
            "theta", "eta", "gamma", "kappa", "demand_sigma"]
OOD_TOL = 0.20


def load_rl() -> tuple[DQNPolicy | None, dict | None]:
    if not RL_WEIGHTS.is_file():
        return None, None
    import json
    meta = json.loads(RL_META_JSON.read_text()) if RL_META_JSON.is_file() else None
    return DQNPolicy.load(RL_WEIGHTS), meta


def rl_status(params: MarketParams, meta: dict | None, pol: DQNPolicy | None) -> dict:
    if pol is None or meta is None:
        return {"included": False, "ood": True, "reason": "no_weights", "deviations": {}}
    trained = meta["trained_on"]
    if params.horizon != trained["horizon"] or len(params.grid) != pol.n_actions or \
            abs(params.price_min - trained["price_min"]) > 1e-9 or abs(params.price_step - trained["price_step"]) > 1e-9:
        return {"included": False, "ood": True, "reason": "different_action_space_or_horizon", "deviations": {}}
    dev = {}
    for k in OOD_KEYS:
        a, b = float(getattr(params, k)), float(trained[k])
        scale = max(abs(b), 0.05 if k in ("gamma", "demand_sigma", "arrival_decay") else 1e-9)
        rel = abs(a - b) / scale
        if rel > 1e-9:
            dev[k] = {"trained": b, "now": a, "rel": rel}
    worst = max((d["rel"] for d in dev.values()), default=0.0)
    return {"included": True, "ood": worst > OOD_TOL, "worst_rel_change": worst,
            "reason": "inputs_far_from_training" if worst > OOD_TOL else "in_distribution",
            "deviations": dev}


def recommend(results: dict[str, SimResult], ok: list[str]) -> dict:
    """Highest mean revenue; but if a SIMPLER policy is statistically tied
    (paired 95 % CI of the difference includes 0), recommend the simpler one."""
    means = {k: float(results[k].revenue.mean()) for k in ok}
    best = max(ok, key=lambda k: means[k])
    ties = []
    for k in ok:
        if k == best:
            continue
        d = paired(results[best], results[k])
        if d["ci95"][0] <= 0:
            ties.append(k)
    simpler_ties = [k for k in POLICY_ORDER if k in ties and POLICY_ORDER.index(k) < POLICY_ORDER.index(best)]
    choice = simpler_ties[0] if simpler_ties else best
    runner_up = max((k for k in ok if k != choice), key=lambda k: means[k], default=None)
    return {"policy": choice, "best_mean": best, "statistically_tied_with_best": ties,
            "rule": "simplest_within_ci" if choice != best else "best_mean",
            "runner_up": runner_up,
            "edge_vs_runner_up": paired(results[choice], results[runner_up]) if runner_up else None,
            "edge_vs_baseline": paired(results[choice], results["fixed"]) if choice != "fixed" else None}


def tunables(key: str, pol) -> dict:
    if key == "fixed":
        return {"price": pol.price}
    if key == "pfa":
        return {"p0": pol.p0, "drift": pol.drift, "k": pol.k}
    if key == "dla":
        return {"prior_n0": pol.prior_n0 if np.isfinite(pol.prior_n0) else None, "iters": pol.iters,
                "fine_days": pol.fine_days, "block_len": pol.block_len, "mip_gap": dla_mod.MIP_GAP}
    return {"architecture": "7-128-128-|grid| MLP, Double DQN", "n_actions": pol.n_actions}


def evaluate(params: MarketParams, *, n_eval: int, n_tune: int, n_tune_dla: int,
             pfa_start: tuple[float, float, float] | None = None, pfa_coarse: bool = True,
             dla_n0: float | None = None, log: Callable[[str], None] = lambda s: None) -> dict:
    params.validate()
    timings: dict[str, float] = {}
    counts: dict[str, int] = {}
    T = params.horizon
    tune_sc = make_scenarios(SEED_TUNING, n_tune, T)
    eval_sc = make_scenarios(SEED_EVAL, n_eval, T)

    t = time.time(); fixed, fixed_curve = tune_fixed(params, tune_sc); timings["tune_fixed"] = time.time() - t
    log(f"baseline: best fixed price ${fixed.price:.0f}")
    t = time.time(); pfa, pfa_info = tune_pfa(params, tune_sc, start=pfa_start, coarse=pfa_coarse)
    timings["tune_pfa"] = time.time() - t
    log(f"PFA tuned: {pfa}")
    dla_rows = None
    if dla_n0 is None:
        t = time.time()
        dla, dla_rows = tune_dla(params, make_scenarios(SEED_TUNING, n_tune_dla, T, start=10_000))
        timings["tune_dla"] = time.time() - t
        log(f"DLA tuned: prior_n0={dla.prior_n0}")
    else:
        dla = Lookahead(prior_n0=dla_n0)

    rl_pol, rl_meta = load_rl()
    rls = rl_status(params, rl_meta, rl_pol)
    policies = {"fixed": fixed, "pfa": pfa, "dla": dla}
    if rls["included"]:
        policies["rl"] = rl_pol

    results: dict[str, SimResult] = {}
    for k, pol in policies.items():
        t = time.time()
        results[k] = run(pol, params, eval_sc, parallel=(k == "dla"), counts=counts if k == "dla" else None)
        timings[f"eval_{k}"] = time.time() - t
        log(f"evaluated {k}: mean revenue {results[k].revenue.mean():,.0f}  ({timings[f'eval_{k}']:.1f}s)")

    edges = revenue_edges(list(results.values()))
    out_pol = {}
    for k, pol in policies.items():
        s = summarize(results[k], params)
        s["histogram"] = histogram(results[k].revenue, edges)
        s["paired_vs_fixed"] = paired(results[k], results["fixed"]) if k != "fixed" else None
        out_pol[k] = {"key": k, "class": POLICY_CLASS[k], "tunables": tunables(k, pol), "summary": s}
    ok = [k for k in policies if not (k == "rl" and rls["ood"])]
    rec = recommend(results, ok)

    # Day-0 plan the DLA would commit to (for the "recommended price path" chart)
    lk = Lookahead(prior_n0=dla.prior_n0); lk.reset(params, 1)
    plan0 = params.grid[lk.plan(0, params.capacity, params.ref_init, 1.0, params)].tolist()

    return {
        "params": params.to_dict(),
        "grid": params.grid.tolist(),
        "arrival_rates": params.arrival_rates().tolist(),
        "seeds": {"tuning_family": SEED_TUNING, "eval_family": SEED_EVAL, "n_tune": n_tune,
                  "n_tune_dla": n_tune_dla, "n_eval": n_eval, "rl_train_family": rl_meta and rl_meta.get("train_seed_family")},
        "policies": out_pol,
        "order": [k for k in POLICY_ORDER if k in policies],
        "fixed_price_curve": fixed_curve,
        "pfa_tuning": pfa_info,
        "dla_tuning": dla_rows,
        "dla_plan_day0": plan0,
        "rl": rls | {"train_meta": None if rl_meta is None else {
            "best_val_revenue": rl_meta.get("best_val_revenue"), "train_seconds": rl_meta.get("train_seconds"),
            "history": rl_meta.get("history"), "episodes": (rl_meta.get("config") or {}).get("rounds", 0) *
            (rl_meta.get("config") or {}).get("n_envs", 0)}},
        "recommendation": rec,
        "solver": dla_mod.solver_info() | {"solves": counts},
        "timings": {k: round(v, 2) for k, v in timings.items()},
    }


# ---------------------------------------------------------------------------
# Sensitivity analysis
# ---------------------------------------------------------------------------
SWEEPS: dict[str, list[float]] = {
    "eta": [0.1, 0.3, 0.6, 1.0, 1.5, 2.5],
    "theta": [0.5, 0.65, 0.8, 0.9, 0.95],
    "demand_scale": [0.7, 0.85, 1.0, 1.15, 1.3],
    "demand_sigma": [0.0, 0.1, 0.25, 0.4],
}


def sensitivity(base: MarketParams, tuned: dict, n: int, log: Callable[[str], None] = lambda s: None,
                sweeps: dict[str, list[float]] | None = None, n_tune: int = 200) -> dict:
    """For each perturbed market: re-optimise the fixed price, re-tune the PFA by
    pattern search from its default-tuned values, re-solve DLA (it reads the
    model), keep RL weights fixed (flagged out-of-distribution when far)."""
    sweeps = sweeps or SWEEPS
    rl_pol, rl_meta = load_rl()
    out: dict[str, list[dict]] = {}
    sc = make_scenarios(SEED_SENSITIVITY, n, base.horizon)
    tsc = make_scenarios(SEED_TUNING, n_tune, base.horizon, start=20_000)
    pfa0 = (tuned["pfa"]["p0"], tuned["pfa"]["drift"], tuned["pfa"]["k"])
    n0 = tuned["dla"]["prior_n0"]
    n0 = float("inf") if n0 is None else n0
    for name, values in sweeps.items():
        rows = []
        for v in values:
            if name == "demand_scale":
                p = base.replace(total_arrivals=base.total_arrivals * v)
            else:
                p = base.replace(**{name: v})
            t = time.time()
            fixed, _ = tune_fixed(p, tsc)
            pfa, _ = tune_pfa(p, tsc, start=pfa0, coarse=False, max_evals=120)
            res = {"fixed": run(fixed, p, sc), "pfa": run(pfa, p, sc),
                   "dla": run(Lookahead(prior_n0=n0), p, sc, parallel=True)}
            rls = rl_status(p, rl_meta, rl_pol)
            if rls["included"]:
                res["rl"] = run(rl_pol, p, sc)
            ok = [k for k in res if not (k == "rl" and rls["ood"])]
            rec = recommend(res, ok)
            row = {"value": v, "recommended": rec["policy"], "best_mean": rec["best_mean"],
                   "rl_ood": rls["ood"], "fixed_price": fixed.price,
                   "pfa_params": {"p0": pfa.p0, "drift": pfa.drift, "k": pfa.k},
                   "policies": {k: {"mean": float(r.revenue.mean()),
                                    "se": float(r.revenue.std(ddof=1) / np.sqrt(r.revenue.shape[0])),
                                    "p5": float(np.percentile(r.revenue, 5)),
                                    "p95": float(np.percentile(r.revenue, 95)),
                                    "sellout": float(r.sellout.mean()),
                                    "gain_vs_fixed": paired(r, res["fixed"]) if k != "fixed" else None}
                                for k, r in res.items()}}
            rows.append(row)
            log(f"sensitivity {name}={v}: rec={rec['policy']} "
                + " ".join(f"{k}={row['policies'][k]['mean']:,.0f}" for k in res) + f" ({time.time() - t:.0f}s)")
        out[name] = rows
    return {"n_scenarios": n, "seed_family": SEED_SENSITIVITY, "sweeps": out, "base": asdict(base)}
