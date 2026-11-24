"""Paths, seeds and the tiny ``credentials.env`` loader.

Secrets are read into a dict and pushed into ``os.environ`` only for keys that
are not already set. Nothing here ever prints or logs their values.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = Path(os.environ.get("PRICING_DATA_DIR", BACKEND_DIR / "data"))

CALIBRATION_JSON = DATA_DIR / "calibration.json"
PRECOMPUTED_JSON = DATA_DIR / "precomputed.json"
RL_WEIGHTS = DATA_DIR / "rl_dqn.npz"
RL_META_JSON = DATA_DIR / "rl_dqn_meta.json"

# credentials.env lives one level above the project folder (shared by the
# three sibling projects); an explicit path can be given via env var.
_CRED_CANDIDATES = [
    Path(os.environ["CREDENTIALS_ENV"]) if os.environ.get("CREDENTIALS_ENV") else None,
    PROJECT_DIR.parent / "credentials.env",
    PROJECT_DIR / "credentials.env",
]

# ---------------------------------------------------------------------------
# Random-number discipline.  Every scenario is generated from
# np.random.default_rng([FAMILY, scenario_id]); families never overlap, so the
# numbers used to TUNE a policy are never the numbers used to EVALUATE it.
# ---------------------------------------------------------------------------
SEED_TUNING = 11_000        # baseline price search, PFA tuning
SEED_RL_TRAIN = 22_000      # RL training episodes
SEED_EVAL = 99_000          # final evaluation (and live evaluation)
SEED_SENSITIVITY = 77_000   # sensitivity sweeps


def parse_env_file(path: Path) -> dict[str, str]:
    """Parse KEY=VALUE lines; ignores blanks, comments and surrounding quotes."""
    out: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return out
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        if key:
            out[key] = value
    return out


def load_credentials() -> dict[str, str]:
    """Load credentials.env (first file found) into os.environ (non-destructive)."""
    for cand in _CRED_CANDIDATES:
        if cand is not None and cand.is_file():
            values = parse_env_file(cand)
            for k, v in values.items():
                if v and not os.environ.get(k):
                    os.environ[k] = v
            return values
    return {}


def credential_status() -> dict[str, bool]:
    """Which inputs are present (booleans only — never the values)."""
    load_credentials()
    return {
        "kaggle": bool(os.environ.get("KAGGLE_API_TOKEN")
                       or (os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"))),
        "flight_prices_csv": bool(os.environ.get("FLIGHT_PRICES_CSV")),
        "gurobi_license_file": bool(os.environ.get("GRB_LICENSE_FILE")),
    }
