"""Common-random-numbers evaluation, statistics, tuning and sensitivity analysis."""
from __future__ import annotations

import math
import time
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache

import numpy as np

from ..config import EVAL_SEED_BASE, TUNE_SEED_BASE
from ..data.instance import load_instance
from ..phase1.run import get_timetable
from ..policies import make_policy
from ..simulator.env import RegistrationEnv
from ..simulator.params import Settings
from ..simulator.scenario import make_scenario

METRICS = ["total_cost", "unserved", "changed", "instructor_cost", "room_cost", "adjunct_fees", "move_admin",
           "unserved_penalty", "change_penalty", "sections_opened", "sections_cancelled", "adjuncts_hired",
           "orphans_cancelled", "served_share", "demand", "prof_events", "budget_left"]


def tuning_seeds(n: int) -> list[int]:
    return [TUNE_SEED_BASE + i for i in range(n)]


def eval_seeds(n: int) -> list[int]:
    return [EVAL_SEED_BASE + i for i in range(n)]


@lru_cache(maxsize=1)
def _ctx():
    return load_instance(), get_timetable()


def run_one(policy_spec: tuple[str, dict], seed: int, settings: Settings) -> dict:
    inst, tt = _ctx()
    pol = make_policy(policy_spec[0], **policy_spec[1])
    scn = make_scenario(inst, seed, settings.scen)
    out = RegistrationEnv(inst, tt, scn, settings).run(pol)
    out["seed"] = seed
    out["fingerprint"] = scn.fingerprint()
    return out


def _run_chunk(args) -> list[dict]:
    spec, seeds, settings = args
    return [run_one(spec, s, settings) for s in seeds]


def run_many(spec: tuple[str, dict], seeds: list[int], settings: Settings, workers: int = 1) -> list[dict]:
    if workers <= 1 or len(seeds) < 8:
        return _run_chunk((spec, seeds, settings))
    chunks = [seeds[i::workers] for i in range(workers)]
    with ProcessPoolExecutor(workers) as ex:
        parts = list(ex.map(_run_chunk, [(spec, ch, settings) for ch in chunks]))
    out = [r for p in parts for r in p]
    out.sort(key=lambda r: r["seed"])
    return out


def describe(x: np.ndarray) -> dict:
    x = np.asarray(x, dtype=float)
    n = len(x)
    m = float(x.mean())
    sd = float(x.std(ddof=1)) if n > 1 else 0.0
    half = 1.96 * sd / math.sqrt(n) if n > 1 else 0.0
    return {"mean": m, "std": sd, "p5": float(np.percentile(x, 5)), "p50": float(np.percentile(x, 50)),
            "p95": float(np.percentile(x, 95)), "ci_lo": m - half, "ci_hi": m + half, "n": n,
            "min": float(x.min()), "max": float(x.max())}


def summarize(rows: list[dict]) -> dict:
    return {k: describe(np.array([r[k] for r in rows])) for k in METRICS}


def paired(a: list[dict], b: list[dict], key: str = "total_cost") -> dict:
    """Paired (CRN) difference a - b with 95% CI; requires identical scenario order."""
    assert [r["fingerprint"] for r in a] == [r["fingerprint"] for r in b], "CRN violated"
    d = np.array([x[key] - y[key] for x, y in zip(a, b)])
    out = describe(d)
    out["share_a_better"] = float(np.mean(d < 0))
    return out


def histogram(values: np.ndarray, bins: np.ndarray) -> list[int]:
    return np.histogram(values, bins=bins)[0].tolist()


def timed(fn, *a, **k):
    t0 = time.perf_counter()
    out = fn(*a, **k)
    return out, time.perf_counter() - t0
