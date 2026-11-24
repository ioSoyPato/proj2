"""Estimate the SHAPE of the arrival curve from the Expedia "Flight Prices" data.

Data: Kaggle ``dilwong/flightprices`` — ``itineraries.csv`` (~31 GB, ~82 M rows),
one row per (search date, itinerary) with ``seatsRemaining`` and ``totalFare``.
A flight is a stand-in for a concert: fixed capacity, hard deadline.

Estimator (documented on the Calibration page and in docs/REPORT.md)
-------------------------------------------------------------------
1. Keep one or a few routes (default nonstop LAX→JFK), days-to-departure
   d = flightDate − searchDate ∈ [1, 60].
2. For each flight (``legId``) sort its snapshots by d (descending).  For two
   consecutive snapshots d₁ > d₂, the drop in ``seatsRemaining`` is a lower
   bound on seats booked in between; the booking proxy per day
   y = max(s₁ − s₂, 0) / (d₁ − d₂) is attributed to every day in (d₂, d₁].
   Expedia caps the displayed seat count (typically at 9–10), so pairs whose
   first snapshot sits at the cap are dropped (bookings above the cap are
   invisible), as are snapshots with seatsRemaining = 0 (no inventory shown).
3. Average y by d → ȳ_d with n_d contributing pairs.
4. Fit ȳ_d = a·exp(−b·d) by weighted non-linear least squares (weights n_d),
   initialised by a log-linear OLS fit.  Report R² (weighted), RMSE and a
   flight-level bootstrap 90 % interval for b.
Only ``b`` (the SHAPE) is transferred to the concert simulator; the level of
demand (total potential buyers Λ) stays a promoter input because seats on one
aircraft say nothing about the size of a concert's audience.
"""
from __future__ import annotations

import io
import zlib
from dataclasses import dataclass
from typing import BinaryIO, Iterator

import numpy as np
import pandas as pd
from scipy.optimize import curve_fit

USECOLS = ["legId", "searchDate", "flightDate", "startingAirport", "destinationAirport",
           "isNonStop", "totalFare", "seatsRemaining"]
MAX_DAYS = 60


# ---------------------------------------------------------------------------
# Streaming readers — no need to hold (or even store) the 31 GB file
# ---------------------------------------------------------------------------
def _iter_zip_member(stream: BinaryIO, chunk: int = 1 << 20) -> Iterator[bytes]:
    """Decompress the FIRST member of a zip archive from a forward-only stream
    (parses the local file header; works on an HTTP response body)."""
    head = stream.read(30)
    if len(head) < 30 or head[:4] != b"PK\x03\x04":
        raise ValueError("not a zip stream")
    method = int.from_bytes(head[8:10], "little")
    n_name = int.from_bytes(head[26:28], "little")
    n_extra = int.from_bytes(head[28:30], "little")
    stream.read(n_name + n_extra)
    if method == 0:
        while True:
            b = stream.read(chunk)
            if not b:
                return
            yield b
    if method != 8:
        raise ValueError(f"zip compression method {method} not supported for streaming "
                         "(download the file manually and set FLIGHT_PRICES_CSV)")
    d = zlib.decompressobj(-15)
    while True:
        b = stream.read(chunk)
        if not b:
            break
        out = d.decompress(b)
        if out:
            yield out
        if d.eof:
            break
    tail = d.flush()
    if tail:
        yield tail


def iter_bytes(stream: BinaryIO, chunk: int = 1 << 20) -> Iterator[bytes]:
    """Yield decompressed CSV bytes from a plain-CSV or zip stream."""
    first = stream.read(4)
    rest = _Prepend(first, stream)
    if first == b"PK\x03\x04":
        yield from _iter_zip_member(rest, chunk)
    else:
        while True:
            b = rest.read(chunk)
            if not b:
                return
            yield b


class _Prepend(io.RawIOBase):
    def __init__(self, head: bytes, stream: BinaryIO):
        self._head, self._s = head, stream

    def read(self, n: int = -1) -> bytes:  # type: ignore[override]
        if self._head:
            h, self._head = self._head, b""
            if n < 0:
                return h + self._s.read()
            return h + self._s.read(max(0, n - len(h)))
        return self._s.read(n)


@dataclass
class ScanStats:
    bytes_scanned: int = 0
    lines_scanned: int = 0
    rows_kept: int = 0
    stopped_early: bool = False
    progress_every: int = 2_000_000_000
    _next: int = 2_000_000_000


def filter_routes(chunks: Iterator[bytes], routes: list[tuple[str, str]],
                  max_bytes: int | None = None, stats: ScanStats | None = None) -> pd.DataFrame:
    """Line-level pre-filter on the raw CSV (fast bytes search), then parse the
    surviving lines with pandas.  ``routes`` = [(origin, destination), ...]."""
    stats = stats or ScanStats()
    keys = [f",{o},{d},".encode() for o, d in routes]
    header: bytes | None = None
    kept: list[bytes] = []
    buf = b""
    for chunk in chunks:
        stats.bytes_scanned += len(chunk)
        buf += chunk
        lines = buf.split(b"\n")
        buf = lines.pop()
        if header is None and lines:
            header = lines.pop(0)
        stats.lines_scanned += len(lines)
        kept.extend(ln for ln in lines if any(k in ln for k in keys))
        if stats.bytes_scanned >= stats._next:
            stats._next += stats.progress_every
            print(f"  … {stats.bytes_scanned / 1e9:.1f} GB of CSV scanned, {len(kept):,} route rows kept", flush=True)
        if max_bytes is not None and stats.bytes_scanned >= max_bytes:
            stats.stopped_early = True
            break
    if buf and any(k in buf for k in keys):
        kept.append(buf)
    if header is None:
        raise ValueError("empty input")
    stats.rows_kept = len(kept)
    text = header + b"\n" + b"\n".join(kept)
    df = pd.read_csv(io.BytesIO(text), usecols=lambda c: c in USECOLS)
    # the byte pre-filter is a superset (the pattern can occur in other columns): enforce exact routes
    want = {f"{o}-{d}" for o, d in routes}
    df = df[(df["startingAirport"].astype(str) + "-" + df["destinationAirport"].astype(str)).isin(want)]
    stats.rows_kept = int(len(df))
    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Estimator
# ---------------------------------------------------------------------------
def prepare(df: pd.DataFrame, nonstop_only: bool = True) -> pd.DataFrame:
    df = df.copy()
    if nonstop_only and "isNonStop" in df:
        df = df[df["isNonStop"].astype(str).str.lower().isin(["true", "1"])]
    df["searchDate"] = pd.to_datetime(df["searchDate"])
    df["flightDate"] = pd.to_datetime(df["flightDate"])
    df["d"] = (df["flightDate"] - df["searchDate"]).dt.days
    df = df[(df["d"] >= 1) & (df["d"] <= MAX_DAYS)]
    df = df.dropna(subset=["seatsRemaining"])
    df["seatsRemaining"] = df["seatsRemaining"].astype(int)
    df["route"] = df["startingAirport"].astype(str) + "-" + df["destinationAirport"].astype(str)
    # one snapshot per (flight, day-to-departure): keep the max seats shown
    df = (df.groupby(["legId", "d"], as_index=False)
            .agg(seats=("seatsRemaining", "max"), fare=("totalFare", "min"),
                 searchDate=("searchDate", "first"), flightDate=("flightDate", "first"),
                 route=("route", "first")))
    return df


def booking_pairs(snap: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Consecutive-snapshot booking proxies.  Returns (pairs, seat_cap)."""
    cap = int(snap["seats"].max()) if len(snap) else 0
    s = snap.sort_values(["legId", "d"], ascending=[True, False])
    nxt = s.groupby("legId")[["d", "seats"]].shift(-1)
    pairs = pd.DataFrame({"legId": s["legId"], "d1": s["d"], "s1": s["seats"],
                          "d2": nxt["d"], "s2": nxt["seats"]}).dropna()
    pairs["d2"] = pairs["d2"].astype(int)
    pairs = pairs[(pairs["s1"] > 0) & (pairs["s2"] > 0) & (pairs["s1"] < cap)]
    pairs = pairs[(pairs["d1"] - pairs["d2"]) <= 7]          # keep reasonably dense pairs
    pairs["y"] = np.maximum(pairs["s1"] - pairs["s2"], 0) / (pairs["d1"] - pairs["d2"])
    return pairs, cap


def _explode(pairs: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Spread each pair's per-day rate over the days (d2, d1] it covers (vectorised)."""
    d1 = pairs["d1"].to_numpy(int); d2 = pairs["d2"].to_numpy(int)
    span = d1 - d2
    rep = np.repeat(np.arange(len(pairs)), span)
    offs = np.arange(rep.size) - np.repeat(np.cumsum(span) - span, span)
    d = np.repeat(d2, span) + 1 + offs
    y = pairs["y"].to_numpy(float)[rep]
    leg = pd.factorize(pairs["legId"])[0][rep]
    return d, y, leg


def daily_curve(pairs: pd.DataFrame) -> pd.DataFrame:
    """Average booking proxy by days-to-departure d."""
    d, y, _ = _explode(pairs)
    s = np.bincount(d, weights=y, minlength=MAX_DAYS + 1)[1:MAX_DAYS + 1]
    n = np.bincount(d, minlength=MAX_DAYS + 1)[1:MAX_DAYS + 1]
    days = np.arange(1, MAX_DAYS + 1)
    ok = n > 0
    return pd.DataFrame({"d": days[ok], "y": s[ok] / n[ok], "n": n[ok]})


def _expo(d, a, b):
    return a * np.exp(-b * d)


def fit_exponential(curve: pd.DataFrame) -> dict:
    d, y, n = curve["d"].to_numpy(float), curve["y"].to_numpy(float), curve["n"].to_numpy(float)
    pos = y > 0
    if pos.sum() >= 3:
        slope, icpt = np.polyfit(d[pos], np.log(y[pos]), 1, w=np.sqrt(n[pos]))
        p0 = (float(np.exp(icpt)), float(-slope))
    else:
        p0 = (float(y.mean() or 1e-3), 0.0)
    popt, pcov = curve_fit(_expo, d, y, p0=p0, sigma=1 / np.sqrt(n), absolute_sigma=False, maxfev=20000)
    a, b = map(float, popt)
    fitted = _expo(d, a, b)
    w = n / n.sum()
    ybar = float((w * y).sum())
    ss_res = float((w * (y - fitted) ** 2).sum())
    ss_tot = float((w * (y - ybar) ** 2).sum())
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    rmse = float(np.sqrt(np.mean((y - fitted) ** 2)))
    se = np.sqrt(np.diag(pcov)) if np.all(np.isfinite(pcov)) else np.array([np.nan, np.nan])
    return {"a": a, "b": b, "se_a": float(se[0]), "se_b": float(se[1]), "r2_weighted": r2,
            "rmse": rmse, "fitted": fitted.tolist(), "residuals": (y - fitted).tolist()}


def bootstrap_b(pairs: pd.DataFrame, n_boot: int = 200, seed: int = 0) -> list[float]:
    """Flight-level (cluster) bootstrap of b: resample flights with replacement."""
    rng = np.random.default_rng(seed)
    d, y, leg = _explode(pairs)
    L = int(leg.max()) + 1 if leg.size else 0
    if L < 2:
        return []
    S = np.zeros((L, MAX_DAYS + 1)); N = np.zeros((L, MAX_DAYS + 1))
    np.add.at(S, (leg, d), y); np.add.at(N, (leg, d), 1.0)
    days = np.arange(MAX_DAYS + 1)
    out = []
    for _ in range(n_boot):
        w = np.bincount(rng.integers(0, L, L), minlength=L).astype(float)
        s, n = w @ S, w @ N
        ok = (n > 0) & (days >= 1)
        cur = pd.DataFrame({"d": days[ok], "y": s[ok] / n[ok], "n": n[ok]})
        try:
            out.append(fit_exponential(cur)["b"])
        except Exception:
            continue
    return out


def calibrate(df: pd.DataFrame, nonstop_only: bool = True, n_boot: int = 200) -> dict:
    snap = prepare(df, nonstop_only)
    if snap["legId"].nunique() < 20:
        raise ValueError(f"only {snap['legId'].nunique()} flights after filtering — need a larger sample")
    pairs, cap = booking_pairs(snap)
    curve = daily_curve(pairs)
    if len(curve) < 10:
        raise ValueError("too few days-to-departure buckets with data to fit a curve")
    fit = fit_exponential(curve)
    boots = bootstrap_b(pairs, n_boot=n_boot)
    fare = snap.groupby("d")["fare"].mean().reindex(curve["d"]).to_numpy()
    per_route = {}
    if snap["route"].nunique() > 1:
        for r, g in snap.groupby("route"):
            try:
                pr, _ = booking_pairs(g)
                fr = fit_exponential(daily_curve(pr))
                per_route[r] = {"b": fr["b"], "a": fr["a"], "r2_weighted": fr["r2_weighted"],
                                "n_flights": int(g["legId"].nunique()), "n_pairs": int(len(pr))}
            except Exception as exc:  # too little data on one route
                per_route[r] = {"error": str(exc)[:120]}
    return {
        "fit": {"model": "y_d = a * exp(-b * d)", "a": fit["a"], "b": fit["b"], "se_b": fit["se_b"],
                "b_ci90": [float(np.percentile(boots, 5)), float(np.percentile(boots, 95))] if boots else None,
                "n_boot": len(boots), "r2_weighted": fit["r2_weighted"], "rmse": fit["rmse"],
                "last_to_first_day_ratio": float(np.exp(fit["b"] * (MAX_DAYS - 1)))},
        "curve": {"d": curve["d"].astype(int).tolist(), "y": curve["y"].tolist(), "n": curve["n"].astype(int).tolist(),
                  "fitted": fit["fitted"], "residuals": fit["residuals"],
                  "mean_fare": [None if not np.isfinite(v) else float(v) for v in fare]},
        "per_route": per_route,
        "sample": {"n_flights": int(snap["legId"].nunique()), "n_snapshots": int(len(snap)),
                   "n_pairs": int(len(pairs)), "seat_display_cap": cap,
                   "search_date_range": [str(snap["searchDate"].min().date()), str(snap["searchDate"].max().date())],
                   "flight_date_range": [str(snap["flightDate"].min().date()), str(snap["flightDate"].max().date())]},
    }
