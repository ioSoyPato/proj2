"""Exogenous information W_1..W_6, pre-drawn from a single seed (common random numbers).

Everything random in an episode lives here and is drawn BEFORE any policy
acts, from ``np.random.default_rng(seed)`` in a fixed order. Policies
therefore face literally identical students (arrival week, patience, drop
time) and identical professor-unavailability events -- the only thing that
differs between policies is their decisions. ``fingerprint()`` hashes the
arrays so tests can assert this.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

import numpy as np

from ..data.instance import Instance
from .params import ARRIVAL_PROFILE, N_WEEKS, ScenarioParams


@dataclass(frozen=True)
class Scenario:
    seed: int
    demand: np.ndarray           # (n_courses,) total requests per course
    lam: np.ndarray              # (n_courses,) realised mean (for diagnostics only)
    arrive: list[np.ndarray]     # per course: arrival week of each student (sorted)
    patience: list[np.ndarray]   # per course: weeks a student tolerates on the waitlist (>=1)
    drop_after: list[np.ndarray] # per course: weeks after enrolment before dropping (>=1)
    unavail_week: np.ndarray     # (n_profs,) week the professor becomes unavailable (>= N_WEEKS: never)

    def fingerprint(self) -> str:
        h = hashlib.sha256()
        for arr in [self.demand, self.unavail_week, *self.arrive, *self.patience, *self.drop_after]:
            h.update(np.ascontiguousarray(arr).tobytes())
        return h.hexdigest()[:16]


def make_scenario(inst: Instance, seed: int, p: ScenarioParams) -> Scenario:
    rng = np.random.default_rng(seed)
    nc = len(inst.courses)
    true_mean = np.array([c.true_mean for c in inst.courses])
    # correlated lognormal shock: a program-wide factor + course-specific noise
    z = rng.standard_normal()
    eta = rng.standard_normal(nc)
    eps = np.sqrt(p.common_share) * z + np.sqrt(1 - p.common_share) * eta
    sig = p.demand_volatility
    lam = true_mean * p.demand_multiplier * np.exp(sig * eps - 0.5 * sig**2)
    demand = rng.poisson(lam)
    base = np.array(ARRIVAL_PROFILE)
    arrive, patience, drop_after = [], [], []
    for c in range(nc):
        prof = rng.dirichlet(base * p.profile_concentration)
        weeks = np.sort(rng.choice(N_WEEKS, size=int(demand[c]), p=prof))
        arrive.append(weeks.astype(np.int16))
        patience.append(rng.geometric(p.renege_prob, size=int(demand[c])).astype(np.int16))
        drop_after.append(rng.geometric(max(p.drop_prob, 1e-9), size=int(demand[c])).clip(max=99).astype(np.int16))
    unavail = (rng.geometric(max(p.unavailability_prob, 1e-12), size=len(inst.profs)) - 1).clip(max=99)
    return Scenario(seed, demand.astype(np.int32), lam, arrive, patience, drop_after, unavail.astype(np.int16))
