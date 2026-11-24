"""Paths, user-provided inputs (credentials.env) and global constants.

`credentials.env` lives one level above the project folder (shared by the
three course projects) and is git-ignored. We parse it with a tiny KEY=VALUE
reader -- no extra dependency -- and NEVER log values, only whether a key is
set. Relevant keys for this project:

* ``GRB_LICENSE_FILE``  optional Gurobi license; without it we use Gurobi's
  size-limited pip license when the model fits (<=2000 vars/constraints) and
  HiGHS (scipy.optimize.milp) otherwise.
* ``COURSE_DATA_DIR``   optional folder with official course data files that
  follow the schema of ``app/data/files`` (see README). If unset/empty, the
  committed synthetic instance is used.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "app" / "data" / "files"
RESULTS_DIR = BACKEND_DIR / "app" / "results"
POLICY_DIR = BACKEND_DIR / "app" / "policies" / "trained"

_CANDIDATE_CRED_FILES = [
    os.environ.get("CREDENTIALS_FILE", ""),
    str(PROJECT_DIR.parent / "credentials.env"),
    str(PROJECT_DIR / "credentials.env"),
]


def _parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if v:
                out[k.strip()] = v
    except OSError:
        pass
    return out


def load_credentials() -> dict[str, str]:
    for p in _CANDIDATE_CRED_FILES:
        if p and Path(p).is_file():
            return _parse_env_file(Path(p))
    return {}


CREDENTIALS = load_credentials()

# Export the Gurobi license path to the environment so gurobipy finds it.
_grb = CREDENTIALS.get("GRB_LICENSE_FILE") or os.environ.get("GRB_LICENSE_FILE", "")
if _grb and Path(_grb).is_file():
    os.environ["GRB_LICENSE_FILE"] = _grb
    GUROBI_FULL_LICENSE = True
else:
    GUROBI_FULL_LICENSE = False

_cdd = CREDENTIALS.get("COURSE_DATA_DIR") or os.environ.get("COURSE_DATA_DIR", "")
COURSE_DATA_DIR: Path | None = Path(_cdd) if _cdd and Path(_cdd).is_dir() else None


def credential_status() -> dict[str, bool]:
    """Only booleans -- safe to expose through the API."""
    return {
        "credentials_file_found": bool(CREDENTIALS) or any(
            p and Path(p).is_file() for p in _CANDIDATE_CRED_FILES
        ),
        "gurobi_license_file": GUROBI_FULL_LICENSE,
        "course_data_dir": COURSE_DATA_DIR is not None,
    }


# ---- seed families: training (RL), tuning (PFA/DLA), final evaluation ----
# Disjoint integer ranges => a policy can never be tuned on an evaluation
# scenario. tests/test_seeds.py asserts the ranges never overlap.
TRAIN_SEED_BASE = 1_000_000
TUNE_SEED_BASE = 2_000_000
EVAL_SEED_BASE = 9_000_000
SAMPLE_SCENARIO_SEED = EVAL_SEED_BASE  # first evaluation scenario, shown on the dashboard
GENERATOR_SEED = 20260101  # synthetic-instance generator
