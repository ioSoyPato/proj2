"""Paths, seeds, defaults and the optional ``credentials.env`` loader.

Credentials are never hard-coded or printed. The only credential this
project can use is ``GRB_LICENSE_FILE`` (an optional Gurobi licence). It is
read from the first ``credentials.env`` found in:

1. the path in the ``CREDENTIALS_FILE`` environment variable,
2. the project root (``project-a-behavioral-portfolio/credentials.env``),
3. the project's parent folder (``proj2/credentials.env``).

An already-set environment variable always wins over the file.
"""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BACKEND_DIR / "data"))

# ---- reproducibility: tuning and evaluation never share a random stream ----
TUNING_SEED = 20_241_001
EVAL_SEED = 20_242_002
SENSITIVITY_SEED = 20_243_003  # sensitivity sweeps reuse the evaluation design but a third stream

N_TUNING_SCENARIOS = 300
N_EVAL_SCENARIOS = 500
HORIZON_MONTHS = 120
BLOCK_MIN, BLOCK_MAX = 3, 6
TRANSACTION_COST = 0.0010  # 10 bp of traded value
INITIAL_WEALTH = 100_000.0

CASH_TICKER = "BIL"


def _parse_env_file(path: Path) -> dict[str, str]:
    """Minimal KEY=VALUE parser: ignores blanks/comments, strips optional quotes."""
    out: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        if key:
            out[key] = value
    return out


def load_credentials() -> list[str]:
    """Load optional credentials into ``os.environ``. Returns the KEYS loaded (never values)."""
    candidates = []
    if os.environ.get("CREDENTIALS_FILE"):
        candidates.append(Path(os.environ["CREDENTIALS_FILE"]))
    candidates += [PROJECT_DIR / "credentials.env", PROJECT_DIR.parent / "credentials.env"]
    loaded: list[str] = []
    for path in candidates:
        if not path.is_file():
            continue
        try:
            values = _parse_env_file(path)
        except OSError:
            continue
        lic = values.get("GRB_LICENSE_FILE", "")
        if lic and "GRB_LICENSE_FILE" not in os.environ:
            if Path(lic).expanduser().is_file():
                os.environ["GRB_LICENSE_FILE"] = str(Path(lic).expanduser())
                loaded.append("GRB_LICENSE_FILE")
        break
    return loaded


LOADED_CREDENTIAL_KEYS = load_credentials()
