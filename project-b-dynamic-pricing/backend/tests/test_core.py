"""Sanity checks: simulator mechanics, CRN, seed separation, DLA capacity, calibration."""
from __future__ import annotations

import io
import itertools
import os
import zipfile

import numpy as np
import pandas as pd
import pytest

from app import config
from app.calibration.flights import calibrate, filter_routes, iter_bytes
from app.policies import dla
from app.policies.rules import FixedPrice, PriceSchedule
from app.simulator.demand import buys, effective_price, purchase_prob, update_reference
from app.simulator.engine import make_scenarios, scarcity_multiplier, simulate
from app.simulator.params import MarketParams

P = MarketParams()


# ---------------------------------------------------------------- dynamics --
def test_reference_price_update():
    assert update_reference(100.0, 150.0, 0.8) == pytest.approx(0.8 * 100 + 0.2 * 150)
    r = np.array([100.0, 50.0])
    np.testing.assert_allclose(update_reference(r, np.array([60.0, 60.0]), 0.5), [80.0, 55.0])


def test_purchase_rule_thresholds():
    eta, gamma = 0.6, 0.3
    # price above reference: surcharge η(p − r)
    assert effective_price(120, 100, eta, gamma) == pytest.approx(120 + 0.6 * 20)
    # price below reference: bonus γ(r − p)
    assert effective_price(80, 100, eta, gamma) == pytest.approx(80 - 0.3 * 20)
    assert effective_price(100, 100, eta, gamma) == pytest.approx(100)
    assert buys(np.array([131.9, 132.0]), 120, 100, eta, gamma).tolist() == [False, True]
    assert buys(np.array([73.9, 74.0]), 80, 100, eta, gamma).tolist() == [False, True]


def test_purchase_prob_matches_agent_level_rule():
    rng = np.random.default_rng(0)
    wtp = np.exp(rng.normal(P.wtp_mu, P.wtp_sigma, 400_000))
    for p, r in [(80, 100), (100, 100), (140, 100), (60, 150)]:
        emp = buys(wtp, p, r, P.eta, P.gamma).mean()
        assert emp == pytest.approx(float(purchase_prob(p, r, P.eta, P.gamma, P.wtp_mu, P.wtp_sigma)), abs=3e-3)


def test_arrival_rates_increase_and_sum():
    lam = P.arrival_rates()
    assert lam.sum() == pytest.approx(P.total_arrivals)
    assert np.all(np.diff(lam) > 0)          # busier as the event approaches


def test_scarcity_multiplier():
    seats = np.array([2000, 200, 199, 0])
    np.testing.assert_allclose(scarcity_multiplier(P, seats), [1, 1, P.kappa, P.kappa])


def test_never_oversells():
    sc = make_scenarios(1, 50, P.horizon)
    for pol in [FixedPrice(40.0), PriceSchedule(60, 0, 0)]:
        r = simulate(pol, P, sc)
        assert np.all(r.sold <= P.capacity) and np.all(r.seats >= 0)
        assert np.all(r.sales.sum(1) == r.sold)
        assert np.allclose(r.revenue, (r.prices * r.sales).sum(1))


# ------------------------------------------------------- CRN & seed hygiene --
def test_scenarios_reproducible_and_prefix_stable():
    a = make_scenarios(config.SEED_EVAL, 20, 60)
    b = make_scenarios(config.SEED_EVAL, 50, 60)
    np.testing.assert_array_equal(a.u_arr, b.u_arr[:20])
    np.testing.assert_array_equal(a.u_level, b.u_level[:20])


def test_crn_identical_across_policies():
    """Two different policy objects that post the same prices see identical outcomes."""
    sc = make_scenarios(config.SEED_EVAL, 40, P.horizon)
    r1 = simulate(FixedPrice(110.0), P, sc)
    r2 = simulate(PriceSchedule(110.0, 0.0, 0.0), P, sc)
    np.testing.assert_array_equal(r1.sales, r2.sales)
    np.testing.assert_array_equal(r1.arrivals, r2.arrivals)
    # and coupling is monotone: a lower price never sells fewer on day 0
    r3 = simulate(FixedPrice(90.0), P, sc)
    assert np.all(r3.sales[:, 0] >= r1.sales[:, 0])
    np.testing.assert_array_equal(r3.arrivals[:, 0], r1.arrivals[:, 0])


def test_seed_families_are_separate():
    fams = [config.SEED_TUNING, config.SEED_RL_TRAIN, config.SEED_EVAL, config.SEED_SENSITIVITY]
    assert len(set(fams)) == len(fams)
    t = make_scenarios(config.SEED_TUNING, 30, 60)
    e = make_scenarios(config.SEED_EVAL, 30, 60)
    assert not np.any(np.isclose(t.u_arr, e.u_arr).all(axis=1))
    assert not np.allclose(t.u_level, e.u_level)


# --------------------------------------------------------------------- DLA --
def _brute(val, wt, cap):
    best, arg = -np.inf, None
    for combo in itertools.product(*[range(val.shape[1])] * val.shape[0]):
        c = np.array(combo)
        w = wt[np.arange(len(c)), c].sum()
        v = val[np.arange(len(c)), c].sum()
        if w <= cap and v > best:
            best, arg = v, c
    return best, arg


@pytest.mark.parametrize("backend", ["auto", "highs"])
def test_mckp_optimal_and_within_capacity(backend, monkeypatch):
    monkeypatch.setenv("DLA_SOLVER", backend)
    monkeypatch.setattr(dla, "_GUROBI_STATE", {"checked": False, "ok": False, "env": None, "reason": ""})
    monkeypatch.setattr(dla, "MIP_GAP", 1e-9)
    rng = np.random.default_rng(3)
    for _ in range(5):
        prices = np.array([50.0, 80.0, 110.0, 140.0])
        D = np.sort(rng.uniform(5, 60, (4, 4)), axis=1)[:, ::-1]     # demand falls with price
        val, cap = prices * D, float(rng.uniform(60, 150))
        sol = dla.solve_mckp(val, D, cap)
        assert D[np.arange(4), sol].sum() <= cap + 1e-6
        best, _ = _brute(val, D, cap)
        assert val[np.arange(4), sol].sum() == pytest.approx(best, rel=1e-6)


def test_dla_plan_respects_capacity_and_simulation():
    pol = dla.Lookahead(prior_n0=300.0)
    pol.reset(P, 1)
    for seats in (2000, 400, 50):
        plan = pol.plan(30, seats, 110.0, 1.0, P)
        assert len(plan) == P.horizon - 30
        # expected sales of the chosen plan (block approximation) fit the remaining seats
        lam = P.arrival_rates()[30:]
        prices = P.grid[plan]
        r = dla.ref_path(110.0, prices, P.theta)
        exp_sales = (lam * purchase_prob(prices, r, P.eta, P.gamma, P.wtp_mu, P.wtp_sigma)).sum()
        top_only = (lam * purchase_prob(np.full(len(lam), P.price_max), dla.ref_path(110.0, np.full(len(lam), P.price_max), P.theta),
                                        P.eta, P.gamma, P.wtp_mu, P.wtp_sigma)).sum()
        assert exp_sales <= seats * 1.05 or np.all(prices == P.price_max) or top_only > seats
    small = P.replace(capacity=150, horizon=12, total_arrivals=600)
    res = simulate(dla.Lookahead(), small, make_scenarios(5, 6, small.horizon))
    assert np.all(res.sold <= small.capacity)


# ------------------------------------------------------------- calibration --
def _synthetic_itineraries(b_true=0.05, n_flights=300, seed=0) -> pd.DataFrame:
    """Synthetic rows with the Kaggle schema (TEST FIXTURE ONLY — never used for calibration)."""
    rng = np.random.default_rng(seed)
    rows = []
    for f in range(n_flights):
        fdate = pd.Timestamp("2022-06-01") + pd.Timedelta(days=int(rng.integers(0, 60)))
        seats = 9
        for d in range(60, 0, -1):
            seats_shown = min(seats, 9)
            if rng.random() < 0.5 and seats_shown > 0:
                rows.append({"legId": f"L{f}", "searchDate": (fdate - pd.Timedelta(days=d)).date().isoformat(),
                             "flightDate": fdate.date().isoformat(), "startingAirport": "LAX",
                             "destinationAirport": "JFK", "isNonStop": True, "totalFare": 300 + 3 * (60 - d),
                             "seatsRemaining": seats_shown})
            seats = max(1, seats - rng.poisson(0.9 * np.exp(-b_true * d)))
            if seats <= 2:
                seats = 9  # a new fare bucket opens
    return pd.DataFrame(rows)


def test_calibration_recovers_shape_on_synthetic_data():
    df = _synthetic_itineraries()
    out = calibrate(df, n_boot=20)
    assert out["fit"]["b"] == pytest.approx(0.05, abs=0.02)
    assert out["sample"]["n_flights"] == 300


def test_streaming_reader_zip_and_route_filter(tmp_path):
    df = _synthetic_itineraries(n_flights=30)
    other = df.head(50).assign(startingAirport="ATL", destinationAirport="LGA")
    csv = pd.concat([df, other]).to_csv(index=False).encode()
    zpath = tmp_path / "itineraries.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("itineraries.csv", csv)
    with open(zpath, "rb") as fh:
        got = filter_routes(iter_bytes(fh), [("LAX", "JFK")])
    assert len(got) == len(df) and set(got["startingAirport"]) == {"LAX"}
    got2 = filter_routes(iter_bytes(io.BytesIO(csv)), [("ATL", "LGA")])
    assert len(got2) == 50


def test_credentials_parser(tmp_path, monkeypatch):
    f = tmp_path / "c.env"
    f.write_text("# comment\nKAGGLE_USERNAME=alice\nKAGGLE_KEY=\"abc\"\nEMPTY=\n")
    vals = config.parse_env_file(f)
    assert vals == {"KAGGLE_USERNAME": "alice", "KAGGLE_KEY": "abc", "EMPTY": ""}
    monkeypatch.delenv("KAGGLE_USERNAME", raising=False)
    assert os.environ.get("KAGGLE_USERNAME") is None


def test_kaggle_token_is_accepted(monkeypatch):
    from scripts.calibrate import kaggle_configured
    for k in ("KAGGLE_API_TOKEN", "KAGGLE_USERNAME", "KAGGLE_KEY"):
        monkeypatch.delenv(k, raising=False)
    assert not kaggle_configured()
    monkeypatch.setenv("KAGGLE_API_TOKEN", "KGAT_dummy")
    assert kaggle_configured()
    monkeypatch.delenv("KAGGLE_API_TOKEN")
    monkeypatch.setenv("KAGGLE_USERNAME", "u"); monkeypatch.setenv("KAGGLE_KEY", "k")
    assert kaggle_configured()
