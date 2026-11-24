"""Policy registry."""
from __future__ import annotations

from .common import Policy
from .dla import WeeklyReoptimization
from .rl import QLearningPolicy
from .rules import Baseline, WaitlistRule

POLICY_ORDER = ["baseline", "pfa", "dla", "rl"]

POLICY_INFO = {
    "baseline": {"class": "Baseline", "label": "Baseline (no changes)"},
    "pfa": {"class": "PFA", "label": "Waitlist rule (PFA)"},
    "dla": {"class": "DLA", "label": "Weekly re-optimization (DLA)"},
    "rl": {"class": "VFA", "label": "Q-learning (VFA / RL)"},
}


def make_policy(name: str, **params) -> Policy:
    if name == "baseline":
        return Baseline()
    if name == "pfa":
        return WaitlistRule(N=params.get("N", 5), M=params.get("M", 10))
    if name == "dla":
        return WeeklyReoptimization(theta=params.get("theta", 1.0))
    if name == "rl":
        return QLearningPolicy()
    raise KeyError(name)
