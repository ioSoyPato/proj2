"""Load the committed monthly dataset (no network access at runtime)."""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import pandas as pd

from ..config import CASH_TICKER, DATA_DIR


@dataclass(frozen=True)
class MarketData:
    """Monthly simple returns, shape (T, N), plus asset metadata."""

    returns: np.ndarray
    dates: list[str]
    tickers: list[str]
    names: dict[str, str]
    asset_class: dict[str, str]
    meta: dict

    @property
    def n_assets(self) -> int:
        return len(self.tickers)

    @property
    def cash_index(self) -> int:
        return self.tickers.index(CASH_TICKER)

    @property
    def classes(self) -> list[str]:
        seen: list[str] = []
        for t in self.tickers:
            c = self.asset_class[t]
            if c not in seen:
                seen.append(c)
        return seen

    def class_matrix(self) -> np.ndarray:
        """(G, N) 0/1 matrix: row g marks the assets in asset class g."""
        cls = self.classes
        m = np.zeros((len(cls), self.n_assets))
        for j, t in enumerate(self.tickers):
            m[cls.index(self.asset_class[t]), j] = 1.0
        return m


@lru_cache(maxsize=1)
def load_market_data() -> MarketData:
    ret = pd.read_csv(DATA_DIR / "returns_monthly.csv", index_col=0, parse_dates=True)
    meta = json.loads((DATA_DIR / "metadata.json").read_text())
    tickers = list(meta["tickers"])
    ret = ret[tickers]
    return MarketData(
        returns=ret.to_numpy(dtype=float),
        dates=[d.strftime("%Y-%m") for d in ret.index],
        tickers=tickers,
        names=meta["names"],
        asset_class=meta["asset_class"],
        meta=meta,
    )
