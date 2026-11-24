"""Sanity checks: MILP constraints, CVaR linearisation, CRN, seed separation,
profile estimation, behavioural policies."""
from __future__ import annotations

import math

import numpy as np
import pytest

from app import config
from app.data.loader import load_market_data
from app.optimization.milp import MILPParams, empirical_cvar, solve_portfolio
from app.policies.rules import RulePolicy
from app.profile.questionnaire import (
    alpha_from_ce, beta_from_ce, estimate_profile, lambda_from_mixed, value_function,
)
from app.simulator.bootstrap import block_bootstrap_indices
from app.simulator.engine import SimContext, simulate


@pytest.fixture(scope="module")
def md():
    return load_market_data()


def _ctx(md, n=200, seed=config.EVAL_SEED, H=120):
    idx = block_bootstrap_indices(md.returns.shape[0], n, H, seed)
    return SimContext(md.returns, md.returns[idx], md.class_matrix(), md.cash_index, 0.001, 100_000.0)


def test_dataset_shape(md):
    assert md.n_assets >= 20
    assert len(md.classes) >= 4
    assert md.returns.shape[0] >= 60
    assert np.isfinite(md.returns).all()


@pytest.mark.parametrize("cap", [0.03, 0.055, 0.09])
def test_milp_constraints(md, cap):
    p = MILPParams(cvar_cap=cap)
    r = solve_portfolio(md.returns, md.class_matrix(), p)
    w, z = r.weights, r.selected
    assert abs(w.sum() - 1) < 1e-6
    assert (w >= -1e-9).all()
    assert z.sum() <= p.max_assets
    held = w > 1e-6
    assert (w[held] >= p.min_weight - 1e-6).all()
    assert (w <= p.max_weight + 1e-6).all()
    assert (z[held] == 1).all()  # holding requires selection
    assert (md.class_matrix() @ w <= p.max_class_weight + 1e-6).all()
    assert r.cvar_empirical <= cap + 1e-5


def test_cvar_linearisation_matches_empirical(md):
    """The RU objective at the optimum equals the exact empirical CVaR of the weights."""
    r = solve_portfolio(md.returns, md.class_matrix(), MILPParams(cvar_cap=0.05))
    assert r.cvar == pytest.approx(r.cvar_empirical, abs=1e-6)


def test_empirical_cvar_simple():
    x = -np.arange(1, 101) / 100.0  # losses 0.01..1.00
    assert empirical_cvar(x, 0.95) == pytest.approx(np.mean(np.arange(96, 101) / 100.0))


def test_gurobi_and_highs_agree(md):
    from app.optimization.solver import gurobi_status

    if not gurobi_status()["available"]:
        pytest.skip("gurobi not available")
    p = MILPParams(cvar_cap=0.05)
    a = solve_portfolio(md.returns, md.class_matrix(), p, prefer="gurobi")
    b = solve_portfolio(md.returns, md.class_matrix(), p, prefer="highs")
    assert a.expected_return_shrunk == pytest.approx(b.expected_return_shrunk, abs=1e-6)


def test_seeds_are_separate(md):
    assert len({config.TUNING_SEED, config.EVAL_SEED, config.SENSITIVITY_SEED}) == 3
    T = md.returns.shape[0]
    a = block_bootstrap_indices(T, 300, 120, config.TUNING_SEED)
    b = block_bootstrap_indices(T, 300, 120, config.EVAL_SEED)
    assert not np.array_equal(a, b)
    # no scenario path is shared between the two sets
    assert not ({tuple(r) for r in a} & {tuple(r) for r in b})


def test_bootstrap_blocks(md):
    T = md.returns.shape[0]
    idx = block_bootstrap_indices(T, 50, 120, 7)
    assert idx.min() >= 0 and idx.max() < T
    steps = np.diff(idx, axis=1) == 1
    # at most one block break every 3 months on average
    assert steps.mean() >= 1 - 1 / 3 - 0.02
    assert np.array_equal(idx, block_bootstrap_indices(T, 50, 120, 7))  # reproducible


def test_common_random_numbers(md):
    """Every policy faces exactly the same returns; identical policies give identical wealth."""
    ctx = _ctx(md)
    x0 = solve_portfolio(md.returns, md.class_matrix(), MILPParams()).weights
    r1 = simulate(RulePolicy("a", x0, band=0.05), ctx)
    paths_before = ctx.paths.copy()
    simulate(RulePolicy("b", x0, panic_drawdown=0.2, chase_intensity=0.5, band=0.05), ctx)
    assert np.array_equal(paths_before, ctx.paths)  # policies cannot alter the exogenous info
    r2 = simulate(RulePolicy("c", x0, band=0.05), ctx)
    assert np.array_equal(r1.wealth, r2.wealth)


def test_behavioural_policies_nest_pfa(md):
    """With d = 100% and k = 0 the behavioural policies are exactly the PFA."""
    ctx = _ctx(md, n=100)
    x0 = solve_portfolio(md.returns, md.class_matrix(), MILPParams()).weights
    base = simulate(RulePolicy("pfa", x0, band=0.05), ctx).wealth
    nop = simulate(RulePolicy("x", x0, band=0.05, panic_drawdown=1.0, chase_intensity=0.0), ctx).wealth
    assert np.allclose(base, nop)


def test_panic_goes_to_cash_after_drawdown(md):
    N = md.n_assets
    T = 24
    hist = md.returns
    paths = np.zeros((1, T, N))
    paths[0, 1:4, :] = -0.10       # three -10% months on every asset (cash too: we zero it below)
    paths[0, :, md.cash_index] = 0.0
    paths[0, 6:, :] = 0.05
    paths[0, :, md.cash_index] = 0.0
    ctx = SimContext(hist, paths, md.class_matrix(), md.cash_index, 0.0, 100.0)
    x0 = np.zeros(N); x0[0] = 1.0
    r = simulate(RulePolicy("p", x0, panic_drawdown=0.2, reentry_recovery=0.10), ctx)
    # after the third drop wealth is 72.9 (-27%): it must sell at t=4 and stay flat in cash
    assert r.wealth[0, 4] == pytest.approx(72.9)
    assert r.wealth[0, 5] == pytest.approx(72.9)
    assert r.cash_months[0] >= 1
    # the market then rises 5%/month; after >=10% recovery it re-enters and grows again
    assert r.wealth[0, -1] > 72.9


def test_profile_formulas():
    assert alpha_from_ce(500, 1000) == pytest.approx(1.0)
    assert alpha_from_ce(350, 1000) == pytest.approx(math.log(0.5) / math.log(0.35))
    assert beta_from_ce(500, 1000) == pytest.approx(1.0)
    assert lambda_from_mixed(2000, 1000, 1.0) == pytest.approx(2.0)
    p = estimate_profile({"q1": 500, "q2": 5000, "q3": 500, "q4": 5000, "q5": 2000, "q6": 20000})
    assert p.alpha == pytest.approx(1.0) and p.beta == pytest.approx(1.0) and p.lam == pytest.approx(2.0)
    v = value_function(np.array([-1.0, 0.0, 1.0]), 0.88, 0.88, 2.25)
    assert v[0] == pytest.approx(-2.25) and v[1] == 0 and v[2] == pytest.approx(1.0)


def test_chaser_trades_at_review_dates(md):
    """The chaser moves k of the portfolio into the trailing top 3 at every review."""
    ctx = _ctx(md, n=50, H=24)
    x0 = solve_portfolio(md.returns, md.class_matrix(), MILPParams()).weights
    pol = RulePolicy("c", x0, band=1.0, chase_intensity=0.5, review_months=6)
    r = simulate(pol, ctx)
    assert (r.n_trades >= 3).all()  # t = 6, 12, 18
    goal = pol._goal  # noqa: SLF001
    assert np.allclose(goal.sum(axis=1), 1.0)
    assert (goal >= 0.5 * x0[None, :] - 1e-12).all()  # (1-k) of the target is kept


def test_credentials_parser(tmp_path):
    from app.config import _parse_env_file

    f = tmp_path / "c.env"
    f.write_text("# comment\nGRB_LICENSE_FILE=\"/x/gurobi.lic\"\nEMPTY=\nexport K=v # note\n")
    d = _parse_env_file(f)
    assert d["GRB_LICENSE_FILE"] == "/x/gurobi.lic" and d["EMPTY"] == "" and d["K"] == "v"
