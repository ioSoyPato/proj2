"""Re-estimate the SHAPE of the arrival curve from the Kaggle "Flight Prices" data.

    cd backend && python -m scripts.calibrate                       # default route LAX-JFK, nonstop
    python -m scripts.calibrate --routes LAX-JFK,ATL-LGA --max-gb 6  # stop after 6 GB of CSV text

Data sources (first one available wins; set them in ../../credentials.env):
  1. FLIGHT_PRICES_CSV = path to itineraries.csv (or a .zip / a partial copy):
     read in a streaming pass, filtering the route(s) line by line.
  2. KAGGLE_API_TOKEN (new-style "KGAT_..." token, sent as a Bearer header) or
     KAGGLE_USERNAME + KAGGLE_KEY (classic kaggle.json): the file is STREAMED from the Kaggle API and
     filtered on the fly — it is never written to disk.  The full file is
     ~31 GB of CSV (a few GB compressed over the network); use --max-gb to stop
     early (rows are ordered by search date, so an early stop shortens the
     search-date window, not the route coverage per day).  Disk needed: ~0 (only
     the filtered route rows, a few MB, are kept in data/raw/).

Writes data/calibration.json (provenance + fit + curve for plotting).  After a
successful calibration run ``python -m scripts.train_rl`` and
``python -m scripts.precompute`` so every policy and number uses the new shape.
No fallback values are ever written to calibration.json: if no data source is
available the script exits with an explanation and the app keeps showing its
"not calibrated with real data" banner.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from app.calibration.flights import ScanStats, calibrate, filter_routes, iter_bytes
from app.config import CALIBRATION_JSON, DATA_DIR, load_credentials
from app.jsonutil import jsonable

KAGGLE_URL = "https://www.kaggle.com/api/v1/datasets/download/dilwong/flightprices/itineraries.csv"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # noqa: D401
        return None


def kaggle_configured() -> bool:
    return bool(os.environ.get("KAGGLE_API_TOKEN")
                or (os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY")))


def open_kaggle_stream():
    token = os.environ.get("KAGGLE_API_TOKEN", "").strip()
    user, key = os.environ.get("KAGGLE_USERNAME", ""), os.environ.get("KAGGLE_KEY", "")
    req = urllib.request.Request(KAGGLE_URL, headers={"User-Agent": "dataset-sampler/1.0"})
    if token or key.startswith("KGAT_"):                # new-style Kaggle API token
        req.add_header("Authorization", f"Bearer {token or key}")
    else:                                               # classic kaggle.json key
        token = base64.b64encode(f"{user}:{key}".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        resp = opener.open(req, timeout=60)
        return resp                                      # served directly
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
            # signed storage URL: fetch WITHOUT the Kaggle credentials
            return urllib.request.urlopen(urllib.request.Request(
                e.headers["Location"], headers={"User-Agent": "dataset-sampler/1.0"}), timeout=120)
        if e.code in (401, 403):
            sys.exit("Kaggle refused the credentials (HTTP %d). Check KAGGLE_API_TOKEN (or "
                     "KAGGLE_USERNAME/KAGGLE_KEY) in "
                     "credentials.env and accept the dataset's terms at "
                     "https://www.kaggle.com/datasets/dilwong/flightprices" % e.code)
        raise


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--routes", default="LAX-JFK", help="comma-separated ORIGIN-DEST pairs (pooled for the fit; "
                    "per-route fits are reported as a robustness check)")
    ap.add_argument("--max-gb", type=float, default=None, help="stop after this many GB of CSV text")
    ap.add_argument("--all-stops", action="store_true", help="keep connecting itineraries too")
    ap.add_argument("--n-boot", type=int, default=200)
    args = ap.parse_args()

    load_credentials()
    routes = [tuple(r.strip().upper().split("-")) for r in args.routes.split(",") if r.strip()]
    max_bytes = int(args.max_gb * 1e9) if args.max_gb else None
    stats = ScanStats()
    t0 = time.time()

    csv_path = os.environ.get("FLIGHT_PRICES_CSV", "").strip()
    if csv_path:
        p = Path(csv_path).expanduser()
        if not p.is_file():
            sys.exit(f"FLIGHT_PRICES_CSV points to a missing file: {p}")
        source = f"local file ({p.name}, {p.stat().st_size / 1e9:.2f} GB on disk)"
        print(f"reading {source}, filtering {routes} ...")
        with open(p, "rb") as fh:
            df = filter_routes(iter_bytes(fh), routes, max_bytes, stats)
    elif kaggle_configured():
        source = "Kaggle API stream (dilwong/flightprices, itineraries.csv)"
        print(f"streaming from Kaggle and filtering {routes} — nothing is stored but the route rows ...")
        with open_kaggle_stream() as resp:
            df = filter_routes(iter_bytes(resp), routes, max_bytes, stats)
    else:
        sys.exit("No data source configured.\n"
                 "Fill KAGGLE_API_TOKEN (or KAGGLE_USERNAME + KAGGLE_KEY, or FLIGHT_PRICES_CSV) in "
                 "credentials.env, then re-run:\n"
                 "    python -m scripts.calibrate\n"
                 "The simulator keeps its documented DEFAULT arrival shape until then.")

    print(f"scanned {stats.bytes_scanned / 1e9:.2f} GB / {stats.lines_scanned:,} lines, kept {stats.rows_kept:,} "
          f"route rows in {time.time() - t0:.0f}s")
    raw_dir = DATA_DIR / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    tag = "_".join(f"{o}-{d}" for o, d in routes)
    df.to_csv(raw_dir / f"flight_sample_{tag}.csv.gz", index=False)

    result = calibrate(df, nonstop_only=not args.all_stops, n_boot=args.n_boot)
    fit = result["fit"]
    for r, f in (result.get("per_route") or {}).items():
        print(f"  route {r}: b = {f['b']:.4f}  R² = {f['r2_weighted']:.3f}  flights = {f['n_flights']}")
    print(f"fit: y_d = {fit['a']:.4f} * exp(-{fit['b']:.4f} d)   weighted R² = {fit['r2_weighted']:.3f}  "
          f"b 90% CI = {fit['b_ci90']}")
    if fit["b"] <= 0:
        print("NOTE: fitted b ≤ 0 — on this route bookings do NOT accelerate toward departure. "
              "It is saved as estimated; the dashboard reports it as such.")
    out = {
        "is_real_data": True,
        "provenance": {"dataset": "kaggle.com/datasets/dilwong/flightprices", "file": "itineraries.csv",
                       "source": source, "route": tag, "routes": [f"{o}-{d}" for o, d in routes],
                       "nonstop_only": not args.all_stops, "bytes_scanned": stats.bytes_scanned,
                       "lines_scanned": stats.lines_scanned, "rows_kept": stats.rows_kept,
                       "stopped_early": stats.stopped_early,
                       "created_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                       "seconds": round(time.time() - t0, 1)},
        **result,
    }
    CALIBRATION_JSON.write_text(json.dumps(jsonable(out), indent=1))
    print(f"saved {CALIBRATION_JSON}\nnext: python -m scripts.train_rl && python -m scripts.precompute")


if __name__ == "__main__":
    main()
