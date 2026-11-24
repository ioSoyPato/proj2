"""Request bodies for the API (validated ranges keep live runs fast and sane)."""
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class ProfileRequest(BaseModel):
    answers: dict[str, float] = Field(default_factory=dict)


class AnalyzeRequest(BaseModel):
    answers: dict[str, float] = Field(default_factory=dict)
    initial_wealth: float = Field(100_000, ge=1_000, le=100_000_000)
    target_growth: float = Field(0.0, ge=0.0, le=0.10, description="reference = W0 (1+g)^10")
    max_assets: int = Field(8, ge=3, le=25)
    max_weight: float = Field(0.30, ge=0.10, le=1.0)
    max_class_weight: float = Field(0.45, ge=0.20, le=1.0)
    cost_bp: float = Field(10.0, ge=0.0, le=200.0)
    n_scenarios: int = Field(500, ge=500, le=2000)
    cvar_cap_override: float | None = Field(None, ge=0.01, le=0.20)

    @model_validator(mode="after")
    def _feasible(self) -> "AnalyzeRequest":
        if self.max_assets * self.max_weight < 1.0 - 1e-9:
            raise ValueError("max_assets x max_weight must be at least 100% or no portfolio is fully invested")
        return self
