"""Cost and uncertainty parameters for Phase 2 (all money in USD per semester)."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace

ARRIVAL_PROFILE = (0.42, 0.26, 0.12, 0.09, 0.07, 0.04)  # share of requests per registration week
N_WEEKS = 6                                             # registration weeks t = 0..5; classes start at t = 6
CANCEL_FROM_WEEK = 2                                    # department rule: no cancellations in weeks 0-1


@dataclass(frozen=True)
class CostParams:
    penalty_unserved: float = 1200.0   # $ per student left without a seat (lost tuition / delayed progress)
    penalty_change: float = 200.0      # $ per student whose section is changed after publication
    ft_section_cost: float = 2800.0    # $ per section taught by full-time faculty (salary share)
    adjunct_hire_fee: float = 600.0    # $ one-off onboarding fee per adjunct hired
    room_base: float = 150.0           # $ per section per semester (cleaning, scheduling)
    room_per_seat: float = 5.0         # $ per seat of the room booked
    room_move_admin: float = 100.0     # $ admin cost of moving a section to another room
    budget: float = 20000.0            # $ cash for adjustments (adjunct fees + adjunct pay)

    def room_cost(self, capacity: int) -> float:
        return self.room_base + self.room_per_seat * capacity


@dataclass(frozen=True)
class ScenarioParams:
    demand_multiplier: float = 1.0     # scales the true mean demand of every course
    demand_volatility: float = 0.20    # sigma of the lognormal course-level demand shock
    common_share: float = 0.30         # share of shock variance common to all courses
    unavailability_prob: float = 0.01  # P(a professor becomes unavailable) per professor per week
    renege_prob: float = 0.15          # P(a waitlisted student gives up) per week waited
    drop_prob: float = 0.02            # P(an enrolled student drops) per week
    profile_concentration: float = 60.0  # Dirichlet concentration around ARRIVAL_PROFILE


@dataclass(frozen=True)
class Settings:
    cost: CostParams = field(default_factory=CostParams)
    scen: ScenarioParams = field(default_factory=ScenarioParams)

    def as_dict(self) -> dict:
        return {"cost": asdict(self.cost), "scen": asdict(self.scen)}

    def with_overrides(self, **kw) -> "Settings":
        cost_kw = {k: v for k, v in kw.items() if k in CostParams.__dataclass_fields__ and v is not None}
        scen_kw = {k: v for k, v in kw.items() if k in ScenarioParams.__dataclass_fields__ and v is not None}
        return Settings(replace(self.cost, **cost_kw), replace(self.scen, **scen_kw))
