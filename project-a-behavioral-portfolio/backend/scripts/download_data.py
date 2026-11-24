"""Download daily adjusted prices from Yahoo Finance and save monthly data.

Usage (from ``backend/``)::

    .venv/bin/python scripts/download_data.py

Writes
  * ``data/prices_monthly.csv``  -- month-end adjusted close, one column per ticker
  * ``data/returns_monthly.csv`` -- simple monthly returns derived from it
  * ``data/metadata.json``       -- tickers, names, asset class, date range, timestamp

Yahoo rate-limits aggressively (HTTP 429). The script downloads in small
batches with exponential backoff and a pause between batches, and only
writes the output once EVERY ticker has at least the required history, so
a partial download can never silently become the dataset.
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# ticker -> (name, asset class / sector). 25 ETFs across 8 groups.
UNIVERSE: dict[str, tuple[str, str]] = {
    "SPY": ("S&P 500", "US equity"),
    "QQQ": ("Nasdaq 100", "US equity"),
    "IWM": ("Russell 2000 small caps", "US equity"),
    "XLK": ("Technology sector", "US sectors"),
    "XLF": ("Financials sector", "US sectors"),
    "XLE": ("Energy sector", "US sectors"),
    "XLV": ("Health care sector", "US sectors"),
    "XLP": ("Consumer staples sector", "US sectors"),
    "XLU": ("Utilities sector", "US sectors"),
    "XLI": ("Industrials sector", "US sectors"),
    "XLY": ("Consumer discretionary sector", "US sectors"),
    "EFA": ("Developed markets ex-US", "International equity"),
    "EEM": ("Emerging markets", "International equity"),
    "VGK": ("Europe equity", "International equity"),
    "VNQ": ("US REITs", "Real estate"),
    "TLT": ("Treasuries 20y+", "Government bonds"),
    "IEF": ("Treasuries 7-10y", "Government bonds"),
    "SHY": ("Treasuries 1-3y", "Government bonds"),
    "TIP": ("Inflation-linked Treasuries", "Government bonds"),
    "LQD": ("Investment-grade corporates", "Credit"),
    "HYG": ("High-yield corporates", "Credit"),
    "GLD": ("Gold", "Commodities"),
    "SLV": ("Silver", "Commodities"),
    "DBC": ("Broad commodities", "Commodities"),
    "BIL": ("T-bills 1-3 months", "Cash"),
}

START = "2008-01-01"
MIN_MONTHS = 60
BATCH = 5


def _download_batch(tickers: list[str], max_tries: int = 8) -> pd.DataFrame:
    import yfinance as yf

    delay = 5.0
    for attempt in range(1, max_tries + 1):
        try:
            df = yf.download(
                tickers, start=START, auto_adjust=True, progress=False,
                group_by="column", threads=False,
            )
            if df is None or df.empty:
                raise RuntimeError("empty frame")
            close = df["Close"] if isinstance(df.columns, pd.MultiIndex) else df[["Close"]].rename(columns={"Close": tickers[0]})
            missing = [t for t in tickers if t not in close.columns or close[t].dropna().empty]
            if missing:
                raise RuntimeError(f"missing {missing}")
            return close[tickers]
        except Exception as exc:  # noqa: BLE001 - yfinance raises many types
            print(f"  batch {tickers} attempt {attempt} failed: {exc}; sleeping {delay:.0f}s", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 120)
    raise RuntimeError(f"could not download {tickers}")


def main() -> int:
    tickers = list(UNIVERSE)
    frames = []
    for i in range(0, len(tickers), BATCH):
        batch = tickers[i:i + BATCH]
        print(f"downloading {batch}", flush=True)
        frames.append(_download_batch(batch))
        time.sleep(3)
    daily = pd.concat(frames, axis=1).sort_index()
    daily.index = pd.to_datetime(daily.index).tz_localize(None)

    monthly = daily.resample("ME").last()
    # drop the current (incomplete) month
    today = pd.Timestamp.today().normalize()
    if monthly.index[-1] >= today:
        monthly = monthly.iloc[:-1]
    monthly = monthly.dropna(how="any")
    if len(monthly) < MIN_MONTHS + 1:
        print(f"only {len(monthly)} complete months; refusing to write", file=sys.stderr)
        return 1

    returns = monthly.pct_change().dropna(how="any")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    monthly.index.name = "date"
    returns.index.name = "date"
    monthly.to_csv(DATA_DIR / "prices_monthly.csv", float_format="%.6f")
    returns.to_csv(DATA_DIR / "returns_monthly.csv", float_format="%.8f")

    meta = {
        "source": "yfinance (Yahoo Finance), auto-adjusted daily close resampled to month-end",
        "synthetic": False,
        "tickers": tickers,
        "names": {t: UNIVERSE[t][0] for t in tickers},
        "asset_class": {t: UNIVERSE[t][1] for t in tickers},
        "price_start": str(monthly.index[0].date()),
        "price_end": str(monthly.index[-1].date()),
        "return_start": str(returns.index[0].date()),
        "return_end": str(returns.index[-1].date()),
        "n_months": int(len(returns)),
        "daily_rows": int(len(daily)),
        "downloaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (DATA_DIR / "metadata.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: meta[k] for k in ("price_start", "price_end", "n_months")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
