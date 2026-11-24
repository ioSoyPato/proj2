from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class MarketIn(BaseModel):
    capacity: int = Field(2000, ge=100, le=20000)
    horizon: int = Field(60, ge=10, le=120)
    price_min: float = Field(40.0, ge=5, le=2000)
    price_max: float = Field(200.0, ge=10, le=5000)
    price_step: float = Field(10.0, ge=1, le=500)
    total_arrivals: float = Field(5200.0, ge=100, le=200000)
    demand_sigma: float = Field(0.25, ge=0.0, le=0.8)
    arrival_decay: float | None = Field(None, ge=-0.2, le=0.3, description="None = calibrated/default shape")
    wtp_median: float = Field(95.0, ge=5, le=5000)
    wtp_sigma: float = Field(0.45, ge=0.05, le=1.5)
    ref_init: float = Field(100.0, ge=1, le=5000)
    theta: float = Field(0.8, ge=0.0, le=0.99)
    eta: float = Field(0.6, gt=0.0, le=5.0)
    gamma: float = Field(0.3, ge=0.0, le=5.0)
    kappa: float = Field(1.5, ge=1.0, le=5.0)


class EvaluateIn(BaseModel):
    market: MarketIn = MarketIn()
    n_scenarios: int = Field(120, ge=40, le=300)


class SweepIn(BaseModel):
    market: MarketIn = MarketIn()
    parameter: Literal["eta", "theta", "gamma", "demand_scale"] = "eta"
    n_scenarios: int = Field(60, ge=30, le=150)


class StateIn(BaseModel):
    days_left: int = Field(60, ge=1, le=120)
    seats_left: int = Field(2000, ge=0, le=20000)
    ref_price: float = Field(100.0, ge=1, le=5000)
    last_sales: int = Field(0, ge=0, le=20000)
    pace: float = Field(1.0, ge=0.2, le=5.0, description="tickets sold so far / tickets expected so far")


class TunedIn(BaseModel):
    fixed_price: float | None = None
    pfa: dict[str, float] | None = None
    dla_n0: float | None = None


class DecideIn(BaseModel):
    market: MarketIn = MarketIn()
    state: StateIn = StateIn()
    tuned: TunedIn = TunedIn()
