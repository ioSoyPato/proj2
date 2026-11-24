"""Sensitivity analysis behind the recommendation (precomputed offline).

Each sweep changes ONE input and re-runs the relevant part of the pipeline:

* loss aversion lambda  -> new CVaR cap -> new MILP portfolio -> re-tuned band -> evaluate
* transaction cost      -> re-tuned band -> evaluate
* reference point       -> re-tuned band -> evaluate (CFA re-scored: its wealth does not depend on Ref)
* panic (d, r) grid     -> behaviour cost vs the disciplined PFA
* chasing (k, f) grid   -> behaviour cost vs the disciplined PFA

Sweeps of the market-level inputs use a third seed (``SENSITIVITY_SEED``),
distinct from both the tuning and the evaluation seeds.
"""
from __future__ import annotations

from dataclasses import replace

import numpy as np

from .. import config
from ..data.loader import load_market_data
from ..optimization.milp import solve_portfolio
from ..policies.rules import RulePolicy
from ..profile.questionnaire import Profile, cvar_cap_from_lambda, estimate_profile
from ..simulator.bootstrap import block_bootstrap_indices
from ..simulator.engine import simulate
from .metrics import paired_difference, pt_values
from .runner import Settings, _ctx, evaluate, milp_params, tune_band

EQUITY_CLASSES = {"US equity", "US sectors", "International equity", "Real estate"}
OPT = ("buy_hold", "pfa_band", "cfa_milp")


def _score(results, s: Settings, prof: Profile, keys=OPT) -> dict:
    out = {}
    for k in keys:
        WT = results[k].wealth[:, -1]
        v = pt_values(WT, s.reference, prof.alpha, prof.beta, prof.lam)
        out[k] = {"mean_pt": float(v.mean()), "ci_half": float(1.96 * v.std(ddof=1) / np.sqrt(len(v))),
                  "median_wealth": float(np.median(WT)), "p5_wealth": float(np.percentile(WT, 5))}
    return out


def _best(scores: dict) -> str:
    return max(scores, key=lambda k: scores[k]["mean_pt"])


def lambda_sweep(answers: dict | None, s: Settings, lams=(1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0), n: int = 500) -> list[dict]:
    md = load_market_data()
    base = estimate_profile(answers)
    rows = []
    tune_ctx = _ctx(md, block_bootstrap_indices(md.returns.shape[0], s.n_tune, s.horizon_months, s.tuning_seed), s)
    for lam in lams:
        prof = replace(base, lam=float(lam))
        mp = milp_params(prof, s)
        x0 = solve_portfolio(md.returns, md.class_matrix(), mp).weights
        band, _ = tune_band(x0, tune_ctx, s, prof)
        res, _ = evaluate(md, prof, s, x0, mp, band, s.cfa, config.SENSITIVITY_SEED, n, keep=OPT + ("unassisted",))
        sc = _score(res, s, prof)
        eq = float(sum(x0[i] for i, t in enumerate(md.tickers) if md.asset_class[t] in EQUITY_CLASSES))
        un = res["unassisted"].wealth[:, -1]
        rows.append({"lam": lam, "cvar_cap": cvar_cap_from_lambda(lam), "equity_share": eq, "band": band,
                     "scores": sc, "best": _best(sc),
                     "unassisted_median_cost": float(np.median(un) - np.median(res["pfa_band"].wealth[:, -1]))})
    return rows


def cost_sweep(answers: dict | None, s: Settings, costs=(0.0, 0.001, 0.0025, 0.005, 0.01), n: int = 500) -> list[dict]:
    md = load_market_data()
    prof = estimate_profile(answers)
    mp = milp_params(prof, s)
    x0 = solve_portfolio(md.returns, md.class_matrix(), mp).weights
    rows = []
    for c in costs:
        s2 = replace(s, cost=c)
        tune_ctx = _ctx(md, block_bootstrap_indices(md.returns.shape[0], s.n_tune, s.horizon_months, s.tuning_seed), s2)
        band, _ = tune_band(x0, tune_ctx, s2, prof)
        res, _ = evaluate(md, prof, s2, x0, mp, band, s.cfa, config.SENSITIVITY_SEED, n, keep=OPT)
        sc = _score(res, s2, prof)
        rows.append({"cost": c, "band": band, "scores": sc, "best": _best(sc),
                     "cfa_mean_costs": float(res["cfa_milp"].costs.mean())})
    return rows


def reference_sweep(answers: dict | None, s: Settings, eval_results: dict,
                    growths=(0.0, 0.02, 0.04, 0.06, 0.08)) -> list[dict]:
    md = load_market_data()
    prof = estimate_profile(answers)
    mp = milp_params(prof, s)
    x0 = solve_portfolio(md.returns, md.class_matrix(), mp).weights
    rows = []
    for g in growths:
        s2 = replace(s, target_growth=g)
        tune_ctx = _ctx(md, block_bootstrap_indices(md.returns.shape[0], s.n_tune, s.horizon_months, s.tuning_seed), s2)
        band, _ = tune_band(x0, tune_ctx, s2, prof)
        res, _ = evaluate(md, prof, s2, x0, mp, band, s.cfa, s.eval_seed, s.n_eval, keep=("buy_hold", "pfa_band"))
        res["cfa_milp"] = eval_results["cfa_milp"]
        sc = _score(res, s2, prof)
        rows.append({"target_growth": g, "reference": s2.reference, "band": band, "scores": sc, "best": _best(sc),
                     "prob_below_reference": {k: float((res[k].wealth[:, -1] < s2.reference).mean()) for k in OPT}})
    return rows


def behavior_grids(answers: dict | None, s: Settings, band: float) -> dict:
    md = load_market_data()
    prof = estimate_profile(answers)
    mp = milp_params(prof, s)
    x0 = solve_portfolio(md.returns, md.class_matrix(), mp).weights
    idx = block_bootstrap_indices(md.returns.shape[0], s.n_eval, s.horizon_months, s.eval_seed)
    ctx = _ctx(md, idx, s)
    base = simulate(RulePolicy("pfa", x0, band=band), ctx).wealth[:, -1]
    vb = pt_values(base, s.reference, prof.alpha, prof.beta, prof.lam)

    def cost(pol) -> dict:
        r = simulate(pol, ctx)
        WT = r.wealth[:, -1]
        v = pt_values(WT, s.reference, prof.alpha, prof.beta, prof.lam)
        d = paired_difference(WT, base)
        return {"median_diff": float(np.median(WT) - np.median(base)), "mean_diff": d["mean"],
                "ci_low": d["ci_low"], "ci_high": d["ci_high"], "pt_diff": float((v - vb).mean()),
                "share_affected": float((np.abs(WT - base) > 1e-6).mean()),
                "cash_months": float(r.cash_months.mean())}

    panic = [{"d": d, "r": r, **cost(RulePolicy("p", x0, band=band, panic_drawdown=d, reentry_recovery=r))}
             for d in (0.10, 0.15, 0.20, 0.25, 0.30, 0.35) for r in (0.05, 0.10, 0.20, 0.30)]
    chase = [{"k": k, "f": f, **cost(RulePolicy("c", x0, band=band, chase_intensity=k, review_months=f))}
             for k in (0.25, 0.5, 0.75, 1.0) for f in (1, 3, 6, 12)]
    return {"panic": panic, "chase": chase}
