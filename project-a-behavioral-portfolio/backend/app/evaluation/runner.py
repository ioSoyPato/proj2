"""End-to-end pipeline: profile -> MILP -> tune (tuning seed) -> evaluate (evaluation seed).

``run_analysis`` is what both the live endpoint and the precompute script call.
Every policy in a run sees the same bootstrap index matrix (common random
numbers); the tuning and evaluation matrices come from different seeds.
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field

import numpy as np

from .. import config
from ..data.loader import MarketData, load_market_data
from ..optimization.milp import MILPParams, MILPResult, solve_portfolio
from ..optimization.solver import active_solver_name
from ..policies.cfa import CFAPolicy
from ..policies.rules import RulePolicy
from ..profile.questionnaire import Profile, cvar_cap_from_lambda, estimate_profile, risk_label, value_function
from ..simulator.bootstrap import block_bootstrap_indices
from ..simulator.engine import SimContext, SimResult, simulate
from .metrics import describe, paired_difference, pt_values, summarize

BAND_GRID = [0.0, 0.01, 0.02, 0.03, 0.05, 0.075, 0.10, 0.15, 0.20, 0.30]
CFA_LOOKBACK_GRID = [36, 60, 120]
CFA_THETA_GRID = [0.75, 1.0, 1.25]
DEFAULT_CFA = {"lookback": 60, "theta": 1.0}

POLICY_META = {
    "buy_hold": {"class": "Baseline", "kind": "optimizing"},
    "pfa_band": {"class": "PFA", "kind": "optimizing"},
    "cfa_milp": {"class": "CFA", "kind": "optimizing"},
    "panic": {"class": "Behavioral", "kind": "behavioral"},
    "chaser": {"class": "Behavioral", "kind": "behavioral"},
    "unassisted": {"class": "Behavioral", "kind": "behavioral"},
}


@dataclass
class Settings:
    initial_wealth: float = config.INITIAL_WEALTH
    target_growth: float = 0.0          # reference = W0 (1+g)^years; 0 => initial wealth
    horizon_months: int = config.HORIZON_MONTHS
    max_assets: int = 8
    max_weight: float = 0.30
    min_weight: float = 0.03
    max_class_weight: float = 0.45
    cost: float = config.TRANSACTION_COST
    n_eval: int = config.N_EVAL_SCENARIOS
    n_tune: int = config.N_TUNING_SCENARIOS
    tuning_seed: int = config.TUNING_SEED
    eval_seed: int = config.EVAL_SEED
    cfa: dict = field(default_factory=lambda: dict(DEFAULT_CFA))
    tune_cfa: bool = False
    cvar_cap_override: float | None = None

    @property
    def years(self) -> float:
        return self.horizon_months / 12.0

    @property
    def reference(self) -> float:
        return self.initial_wealth * (1.0 + self.target_growth) ** self.years


def _ctx(md: MarketData, idx: np.ndarray, s: Settings) -> SimContext:
    return SimContext(hist=md.returns, paths=md.returns[idx], class_m=md.class_matrix(),
                      cash_index=md.cash_index, cost=s.cost, initial_wealth=s.initial_wealth)


def milp_params(profile: Profile, s: Settings) -> MILPParams:
    cap = s.cvar_cap_override if s.cvar_cap_override is not None else cvar_cap_from_lambda(profile.lam)
    return MILPParams(cvar_cap=cap, max_assets=s.max_assets, min_weight=s.min_weight,
                      max_weight=s.max_weight, max_class_weight=s.max_class_weight)


def portfolio_payload(md: MarketData, res: MILPResult, p: MILPParams, s: Settings) -> dict:
    holdings = [
        {"ticker": t, "name": md.names[t], "asset_class": md.asset_class[t],
         "weight": float(res.weights[i]), "dollars": float(res.weights[i] * s.initial_wealth)}
        for i, t in enumerate(md.tickers) if res.weights[i] > 1e-6
    ]
    holdings.sort(key=lambda h: -h["weight"])
    by_class: dict[str, float] = {}
    for h in holdings:
        by_class[h["asset_class"]] = by_class.get(h["asset_class"], 0.0) + h["weight"]
    return {
        "holdings": holdings,
        "by_class": [{"asset_class": k, "weight": v} for k, v in sorted(by_class.items(), key=lambda kv: -kv[1])],
        "expected_return_annual": res.expected_return * 12,
        "expected_return_shrunk_annual": res.expected_return_shrunk * 12,
        "volatility_annual": res.volatility * np.sqrt(12),
        "cvar_monthly": res.cvar, "cvar_monthly_empirical": res.cvar_empirical, "var_monthly": res.var,
        "cvar_cap": p.cvar_cap, "cap_binding": res.cap_binding, "feasible_cap": res.feasible_cap,
        "n_selected": int(res.selected.sum()),
        "solver": res.solver, "status": res.status, "solve_seconds": res.seconds,
        "params": asdict(p),
    }


def frontier(md: MarketData, p: MILPParams) -> list[dict]:
    out = []
    for cap in [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10]:
        r = solve_portfolio(md.returns, md.class_matrix(), MILPParams(**{**asdict(p), "cvar_cap": cap}))
        out.append({"cvar_cap": cap, "cvar": r.cvar_empirical, "expected_return_annual": r.expected_return * 12,
                    "volatility_annual": r.volatility * np.sqrt(12)})
    return out


def _mean_pt(res: SimResult, s: Settings, prof: Profile) -> float:
    return float(pt_values(res.wealth[:, -1], s.reference, prof.alpha, prof.beta, prof.lam).mean())


def tune_band(x0: np.ndarray, ctx: SimContext, s: Settings, prof: Profile) -> tuple[float, list[dict]]:
    rows = []
    for b in BAND_GRID + [np.inf]:
        r = simulate(RulePolicy("t", x0, band=b), ctx)
        rows.append({"band": None if np.isinf(b) else b, "mean_pt": _mean_pt(r, s, prof),
                     "median_wealth": float(np.median(r.wealth[:, -1])),
                     "annual_turnover": float(r.turnover.mean() / s.years)})
    finite = [r for r in rows if r["band"] is not None]
    best = max(finite, key=lambda r: r["mean_pt"])
    return float(best["band"]), rows


def tune_cfa(x0: np.ndarray, mp: MILPParams, ctx: SimContext, s: Settings, prof: Profile) -> tuple[dict, list[dict]]:
    rows = []
    for L in CFA_LOOKBACK_GRID:
        for th in CFA_THETA_GRID:
            r = simulate(CFAPolicy("t", x0, mp, lookback=L, theta=th), ctx)
            rows.append({"lookback": L, "theta": th, "mean_pt": _mean_pt(r, s, prof),
                         "median_wealth": float(np.median(r.wealth[:, -1]))})
    best = max(rows, key=lambda r: r["mean_pt"])
    return {"lookback": best["lookback"], "theta": best["theta"]}, rows


def build_policies(x0: np.ndarray, mp: MILPParams, band: float, cfa: dict, prof: Profile) -> dict:
    d = prof.panic_drawdown if prof.panic_drawdown < 1.0 else None
    return {
        "buy_hold": RulePolicy("buy_hold", x0, band=np.inf),
        "pfa_band": RulePolicy("pfa_band", x0, band=band),
        "cfa_milp": CFAPolicy("cfa_milp", x0, mp, lookback=int(cfa["lookback"]), theta=float(cfa["theta"])),
        "panic": RulePolicy("panic", x0, band=band, panic_drawdown=prof.panic_drawdown,
                            reentry_recovery=prof.reentry_recovery),
        "chaser": RulePolicy("chaser", x0, band=band, chase_intensity=prof.chase_intensity,
                             review_months=prof.review_months),
        "unassisted": RulePolicy("unassisted", x0, band=band, panic_drawdown=d if d is not None else 1.0,
                                 reentry_recovery=prof.reentry_recovery,
                                 chase_intensity=prof.chase_intensity, review_months=prof.review_months),
    }


def _histograms(results: dict[str, SimResult], bins: int = 36) -> dict:
    allw = np.concatenate([r.wealth[:, -1] for r in results.values()])
    lo, hi = np.percentile(allw, [0.5, 99.5])
    edges = np.linspace(lo, hi, bins + 1)
    return {"edges": edges, "counts": {k: np.histogram(np.clip(r.wealth[:, -1], lo, hi), edges)[0]
                                       for k, r in results.items()}}


def recommend(summ: dict, results: dict[str, SimResult], s: Settings, prof: Profile) -> dict:
    opt = [k for k, m in POLICY_META.items() if m["kind"] == "optimizing"]
    best = max(opt, key=lambda k: summ[k]["pt_value"]["mean"])
    pt = {k: pt_values(results[k].wealth[:, -1], s.reference, prof.alpha, prof.beta, prof.lam) for k in opt}
    comparisons = {}
    tied = []
    for k in opt:
        if k == best:
            continue
        d = paired_difference(pt[best], pt[k])
        dw = paired_difference(results[best].wealth[:, -1], results[k].wealth[:, -1])
        comparisons[k] = {"pt_diff": d, "wealth_diff": dw}
        if d["ci_low"] <= 0:
            tied.append(k)
    return {"policy": best, "tied_with": tied, "comparisons": comparisons}


def evaluate(md: MarketData, prof: Profile, s: Settings, x0: np.ndarray, mp: MILPParams,
             band: float, cfa: dict, seed: int, n: int, keep: tuple[str, ...] | None = None) -> tuple[dict, dict]:
    idx = block_bootstrap_indices(md.returns.shape[0], n, s.horizon_months, seed)
    ctx = _ctx(md, idx, s)
    pols = build_policies(x0, mp, band, cfa, prof)
    results = {}
    for k, pol in pols.items():
        if keep is None or k in keep:
            results[k] = simulate(pol, ctx)
    return results, {"idx": idx, "ctx": ctx}


def run_analysis(answers: dict | None, s: Settings) -> dict:
    t0 = time.perf_counter()
    timings: dict[str, float] = {}
    md = load_market_data()
    prof = estimate_profile(answers)
    mp = milp_params(prof, s)
    milp_res = solve_portfolio(md.returns, md.class_matrix(), mp)
    x0 = milp_res.weights
    timings["milp"] = time.perf_counter() - t0

    # ---- tuning (tuning seed only) ----
    t1 = time.perf_counter()
    tune_idx = block_bootstrap_indices(md.returns.shape[0], s.n_tune, s.horizon_months, s.tuning_seed)
    tune_ctx = _ctx(md, tune_idx, s)
    band, band_rows = tune_band(x0, tune_ctx, s, prof)
    cfa_rows: list[dict] = []
    cfa = dict(s.cfa)
    if s.tune_cfa:
        cfa, cfa_rows = tune_cfa(x0, mp, tune_ctx, s, prof)
    timings["tuning"] = time.perf_counter() - t1

    # ---- evaluation (evaluation seed only) ----
    t2 = time.perf_counter()
    results, aux = evaluate(md, prof, s, x0, mp, band, cfa, s.eval_seed, s.n_eval)
    timings["evaluation"] = time.perf_counter() - t2

    summ = {k: summarize(r, s.reference, prof.to_dict(), s.initial_wealth, s.years) for k, r in results.items()}
    WT = {k: r.wealth[:, -1] for k, r in results.items()}
    pt = {k: pt_values(w, s.reference, prof.alpha, prof.beta, prof.lam) for k, w in WT.items()}
    behavior_cost = {}
    for k in ("panic", "chaser", "unassisted"):
        behavior_cost[k] = {
            "median_wealth_diff": float(np.median(WT[k]) - np.median(WT["pfa_band"])),
            "wealth_diff": paired_difference(WT[k], WT["pfa_band"]),
            "pt_diff": paired_difference(pt[k], pt["pfa_band"]),
            "pt_ce_diff": summ[k]["pt_certainty_equivalent"] - summ["pfa_band"]["pt_certainty_equivalent"],
            "share_affected": float((np.abs(WT[k] - WT["pfa_band"]) > 1e-6).mean()),
        }
    rec = recommend(summ, results, s, prof)

    xs = np.linspace(-0.5, 0.5, 101)
    return {
        "data": {
            "source": md.meta["source"], "synthetic": bool(md.meta.get("synthetic", False)),
            "tickers": md.tickers, "names": md.names, "asset_class": md.asset_class,
            "classes": md.classes, "start": md.meta["return_start"], "end": md.meta["return_end"],
            "n_months": md.meta["n_months"], "downloaded_at": md.meta["downloaded_at"],
        },
        "profile": {**prof.to_dict(), "risk_label": risk_label(prof.lam),
                    "cvar_cap": mp.cvar_cap,
                    "value_curve": {"x": xs, "v": value_function(xs, prof.alpha, prof.beta, prof.lam)}},
        "settings": {**asdict(s), "reference": s.reference},
        "portfolio": portfolio_payload(md, milp_res, mp, s),
        "frontier": frontier(md, mp),
        "tuning": {"seed": s.tuning_seed, "n": s.n_tune, "band_grid": band_rows, "band_selected": band,
                   "cfa_grid": cfa_rows, "cfa_selected": cfa, "cfa_tuned_live": s.tune_cfa},
        "evaluation": {"seed": s.eval_seed, "n": s.n_eval, "horizon_months": s.horizon_months,
                       "policies": {k: {**POLICY_META[k], **summ[k]} for k in results},
                       "histogram": _histograms(results)},
        "behavior_cost": behavior_cost,
        "recommendation": rec,
        "solver": active_solver_name(),
        "timings": {**timings, "total": time.perf_counter() - t0},
    }


def jsonable(o):
    """Recursively convert numpy types (and inf/nan) into JSON-safe Python."""
    if isinstance(o, dict):
        return {str(k): jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    if isinstance(o, np.ndarray):
        return jsonable(o.tolist())
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        f = float(o)
        return f if np.isfinite(f) else None
    if isinstance(o, np.bool_):
        return bool(o)
    return o
