"""Market parameters for the ticket-pricing simulator.

Units: money in US dollars, time in days, capacity in seats.  Day index
``t = 0..T-1``; "days left" on day t is ``d_t = T - t`` (so the first selling
day has d = T and the last one d = 1; the event happens at d = 0).
"""
from __future__ import annotations

import dataclasses
import json
from dataclasses import dataclass, field

import numpy as np

from ..config import CALIBRATION_JSON

# Shape of the arrival curve when no real-data calibration exists.
# lambda_t  ∝  exp(-b * (d_t - 1)) : b > 0 means buyers arrive faster as the
# event approaches.  b = 0.035 makes the last day ~8x busier than the first.
DEFAULT_ARRIVAL_DECAY = 0.035


@dataclass(frozen=True)
class MarketParams:
    capacity: int = 2000                 # C, seats
    horizon: int = 60                    # T, selling days
    price_min: float = 40.0              # $ lower end of the price grid
    price_max: float = 200.0             # $ upper end of the price grid
    price_step: float = 10.0             # $ grid step
    total_arrivals: float = 5200.0       # Λ, expected potential buyers over the window (before scarcity boost)
    demand_sigma: float = 0.25           # σ_D: per-event demand-level shock M ~ LogNormal(−σ_D²/2, σ_D), E[M]=1.
                                         #      Unknown to the promoter; 0 recovers the pure-Poisson assignment model.
    arrival_decay: float = DEFAULT_ARRIVAL_DECAY  # b, shape of the arrival curve (1/day)
    wtp_median: float = 95.0             # $ median willingness to pay  (= exp(mu))
    wtp_sigma: float = 0.45              # σ of log-WTP (dimensionless)
    ref_init: float = 100.0              # r_0, $ initial reference price (what fans "expect")
    theta: float = 0.8                   # θ ∈ [0,1): reference-price memory
    eta: float = 0.6                     # η > 0: loss-aversion surcharge on prices above reference
    gamma: float = 0.3                   # γ ≥ 0: gain bonus on prices below reference
    kappa: float = 1.5                   # κ ≥ 1: arrival multiplier when < scarcity_frac of seats remain
    scarcity_frac: float = 0.10          # threshold as fraction of capacity
    arrival_shape_source: str = field(default="default", compare=False)

    # ---- derived quantities -------------------------------------------------
    @property
    def grid(self) -> np.ndarray:
        n = int(round((self.price_max - self.price_min) / self.price_step)) + 1
        return self.price_min + self.price_step * np.arange(n, dtype=float)

    @property
    def wtp_mu(self) -> float:
        return float(np.log(self.wtp_median))

    def days_left(self) -> np.ndarray:
        """d_t for t = 0..T-1."""
        return self.horizon - np.arange(self.horizon, dtype=float)

    def arrival_rates(self) -> np.ndarray:
        """λ_t (expected potential buyers on day t, before the scarcity boost)."""
        d = self.days_left()
        w = np.exp(-self.arrival_decay * (d - 1.0))
        return self.total_arrivals * w / w.sum()

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)

    def replace(self, **kw) -> "MarketParams":
        return dataclasses.replace(self, **kw)

    def validate(self) -> None:
        if self.capacity < 1 or self.horizon < 2:
            raise ValueError("capacity must be ≥1 and horizon ≥2")
        if not (0 < self.price_min < self.price_max) or self.price_step <= 0:
            raise ValueError("price grid must satisfy 0 < min < max, step > 0")
        if len(self.grid) > 60:
            raise ValueError("price grid too fine (max 60 points)")
        if not (0.0 <= self.theta < 1.0):
            raise ValueError("theta must be in [0, 1)")
        if self.eta <= 0 or self.gamma < 0 or self.kappa < 1:
            raise ValueError("need eta > 0, gamma ≥ 0, kappa ≥ 1")
        if not (0.0 <= self.demand_sigma <= 1.0):
            raise ValueError("demand_sigma must be in [0, 1]")
        if self.wtp_sigma <= 0 or self.wtp_median <= 0 or self.total_arrivals <= 0:
            raise ValueError("WTP and arrival parameters must be positive")


def load_calibration() -> dict | None:
    """The real-data calibration, or None when the project still runs on defaults."""
    if not CALIBRATION_JSON.is_file():
        return None
    try:
        cal = json.loads(CALIBRATION_JSON.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    if not cal.get("is_real_data"):
        return None
    return cal


def default_params() -> MarketParams:
    """Assignment defaults; the arrival-curve SHAPE comes from calibration if available."""
    cal = load_calibration()
    if cal is not None:
        return MarketParams(
            arrival_decay=float(cal["fit"]["b"]),
            arrival_shape_source=f"calibrated:{cal['provenance']['route']}",
        )
    return MarketParams()
