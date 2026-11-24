"""Print the Markdown result tables used in README.md / docs/REPORT.md
directly from data/precomputed.json (so no number is typed by hand).

    cd backend && python -m scripts.report_tables [--lang es]
"""
from __future__ import annotations

import argparse
import json

from app.config import PRECOMPUTED_JSON

NAMES = {
    "en": {"fixed": "Fixed price (baseline)", "pfa": "Price-schedule rule (PFA)", "dla": "Daily lookahead MILP (DLA)",
           "rl": "RL agent, Double DQN (VFA)"},
    "es": {"fixed": "Precio fijo (línea base)", "pfa": "Regla de calendario (PFA)", "dla": "Anticipación diaria MILP (DLA)",
           "rl": "Agente RL, Double DQN (VFA)"},
}
HEAD = {
    "en": "| Policy | Mean revenue | 95% CI of mean | Std | P5 | P95 | Sell-out prob. | vs fixed (paired) | Beats fixed in |",
    "es": "| Política | Ingreso medio | IC 95% de la media | Desv. | P5 | P95 | Prob. de agotar | vs fijo (pareado) | Supera al fijo en |",
}


def k(x: float) -> str:
    return f"${x / 1000:,.1f}k"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", default="en", choices=["en", "es"])
    a = ap.parse_args()
    d = json.loads(PRECOMPUTED_JSON.read_text())
    L = a.lang
    print(HEAD[L])
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    rec = d["recommendation"]["policy"]
    for key in d["order"]:
        s = d["policies"][key]["summary"]
        r = s["revenue"]
        g = s["paired_vs_fixed"]
        name = NAMES[L][key] + (" ★" if key == rec else "")
        vs = f"{g['pct'] * 100:+.1f}% ({k(g['ci95'][0])} … {k(g['ci95'][1])})" if g else "—"
        win = f"{g['win_rate'] * 100:.0f}%" if g else "—"
        print(f"| {name} | **{k(r['mean'])}** | {k(r['ci95'][0])} – {k(r['ci95'][1])} | {k(r['std'])} | {k(r['p5'])} | "
              f"{k(r['p95'])} | {s['sellout']['prob'] * 100:.1f}% | {vs} | {win} |")
    print()
    print(f"n_eval={d['seeds']['n_eval']}  n_tune={d['seeds']['n_tune']}  generated={d['generated_at']}  "
          f"solver={d['solver']['preferred']} {d['solver']['version']} solves={d['solver'].get('solves')}")
    print("tunables:", {key: d["policies"][key]["tunables"] for key in d["order"]})
    print("dla_tuning:", d.get("dla_tuning"))
    print("recommendation:", json.dumps(d["recommendation"], indent=None)[:600])
    for key in d["order"]:
        s = d["policies"][key]["summary"]
        print(key, "sold", round(s["tickets"]["mean_sold"]), "avg_paid", round(s["avg_price_paid"] or 0, 2),
              "first_price", s["first_price"], "sellout_ci", [round(x, 3) for x in s["sellout"]["ci95"]],
              "days_left_at_sellout", s["sellout"]["mean_days_left_at_sellout"])
    sens = d.get("sensitivity")
    if sens:
        for name, rows in sens["sweeps"].items():
            print(f"\n[{name}]")
            for r in rows:
                cells = " ".join(f"{p}={k(v['mean'])}" for p, v in r["policies"].items())
                print(f"  {r['value']}: rec={r['recommended']} best={r['best_mean']} fixed@${r['fixed_price']:.0f} {cells}"
                      + ("  (rl OOD)" if r["rl_ood"] else ""))
    print("\ntimings:", d["timings"], "total_s:", d.get("total_seconds"))


if __name__ == "__main__":
    main()
