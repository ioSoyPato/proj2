"""Render the markdown tables used in README.md / docs/REPORT.md straight from the results JSON.

    cd backend && .venv/bin/python -m scripts.render_tables > /tmp/tables.md

Every number in the docs comes from here, so docs and dashboard can't drift apart.
"""
from __future__ import annotations

import json

from app.config import RESULTS_DIR

R = json.loads((RESULTS_DIR / "evaluation.json").read_text(encoding="utf-8"))
P1 = json.loads((RESULTS_DIR / "phase1.json").read_text(encoding="utf-8"))
NAMES = {
    "en": {"baseline": "Baseline (no changes)", "pfa": "Waitlist rule (PFA)", "dla": "Weekly re-optimization (DLA)", "rl": "Q-learning (VFA/RL)"},
    "es": {"baseline": "Base (sin cambios)", "pfa": "Regla de lista de espera (PFA)", "dla": "Re-optimización semanal (DLA)", "rl": "Q-learning (VFA/RL)"},
}
FACT = {
    "en": {"penalty_unserved": "Penalty per unserved student ($)", "demand_multiplier": "Demand multiplier", "demand_volatility": "Demand volatility σ",
           "unavailability_prob": "Weekly prof. unavailability prob.", "budget": "Adjustment budget ($)"},
    "es": {"penalty_unserved": "Penalización por alumno sin lugar ($)", "demand_multiplier": "Multiplicador de demanda", "demand_volatility": "Volatilidad de demanda σ",
           "unavailability_prob": "Prob. semanal de baja de profesor", "budget": "Presupuesto de ajustes ($)"},
}


def m(x: float) -> str:
    return f"${x:,.0f}"


def order() -> list[dict]:
    return sorted(R["policies"], key=lambda p: p["stats"]["total_cost"]["mean"])


def params(p: dict) -> str:
    if p["name"] == "pfa":
        return f"N={p['params']['N']}, M={p['params']['M']}"
    if p["name"] == "dla":
        return f"θ={p['params']['theta']}"
    if p["name"] == "rl":
        return f"{R['tuning']['rl']['episodes']:,} ep."
    return "—"


def headline(lang: str) -> str:
    h = {"en": "| Policy | Class | Tuned params | Mean total cost | 95% CI | Std | P5 – P95 | Unserved students (mean) | Moved students (mean) |",
         "es": "| Política | Clase | Parámetros | Costo total medio | IC 95% | Desv. est. | P5 – P95 | Alumnos sin lugar (media) | Alumnos cambiados (media) |"}[lang]
    rows = [h, "|---|---|---|---:|---:|---:|---:|---:|---:|"]
    for p in order():
        s = p["stats"]["total_cost"]
        name = NAMES[lang][p["name"]]
        if p["name"] == R["best"]:
            name = f"**{name}**"
        rows.append(f"| {name} | {p['class']} | {params(p)} | {m(s['mean'])} | {m(s['ci_lo'])} – {m(s['ci_hi'])} | {m(s['std'])} | "
                    f"{m(s['p5'])} – {m(s['p95'])} | {p['stats']['unserved']['mean']:.1f} | {p['stats']['changed']['mean']:.1f} |")
    return "\n".join(rows)


def unserved(lang: str) -> str:
    h = {"en": "| Policy | Mean | 95% CI | Std | P5 | P95 |", "es": "| Política | Media | IC 95% | Desv. est. | P5 | P95 |"}[lang]
    rows = [h, "|---|---:|---:|---:|---:|---:|"]
    for p in order():
        s = p["stats"]["unserved"]
        rows.append(f"| {NAMES[lang][p['name']]} | {s['mean']:.1f} | {s['ci_lo']:.1f} – {s['ci_hi']:.1f} | {s['std']:.1f} | {s['p5']:.0f} | {s['p95']:.0f} |")
    return "\n".join(rows)


def paired(lang: str) -> str:
    h = {"en": f"| Policy vs. {NAMES['en'][R['best']]} | Extra cost (mean) | Paired 95% CI | Share of scenarios where it is cheaper |",
         "es": f"| Política vs. {NAMES['es'][R['best']]} | Costo extra (media) | IC 95% pareado | Escenarios en que es más barata |"}[lang]
    rows = [h, "|---|---:|---:|---:|"]
    for n, s in R["paired_vs_best"].items():
        rows.append(f"| {NAMES[lang][n]} | {m(s['mean'])} | {m(s['ci_lo'])} – {m(s['ci_hi'])} | {100 * s['share_a_better']:.0f}% |")
    return "\n".join(rows)


def sensitivity(lang: str) -> str:
    h = {"en": "| Factor | Value | Baseline | PFA | DLA | RL | Best | Gap to runner-up (paired 95% CI) |",
         "es": "| Factor | Valor | Base | PFA | DLA | RL | Mejor | Ventaja sobre la segunda (IC 95% pareado) |"}[lang]
    rows = [h, "|---|---:|---:|---:|---:|---:|---|---:|"]
    for s in R["sensitivity"]:
        cost = {p["name"]: p["mean_cost"] for p in s["policies"]}
        g = s.get("gap_to_runner_up", {"mean": float("nan"), "ci_lo": float("nan"), "ci_hi": float("nan")})
        tie = "" if s.get("significant") else (" (tie)" if lang == "en" else " (empate)")
        v = s["value"]
        rows.append(f"| {FACT[lang][s['factor']]} | {v:g} | {m(cost['baseline'])} | {m(cost['pfa'])} | {m(cost['dla'])} | {m(cost['rl'])} | "
                    f"{s['best'].upper()}{tie} | {m(g['mean'])} ({m(g['ci_lo'])} – {m(g['ci_hi'])}) |")
    return "\n".join(rows)


def phase1(lang: str) -> str:
    mono = P1["monolithic"]["result"]
    deco = P1["decomposed"]
    a = deco["info"]["stage_a"][-1]
    b = deco["info"]["stage_b"]
    h = {"en": "| Model | Solver that ran | Variables | Constraints | Objective | Gap | Time |",
         "es": "| Modelo | Solver usado | Variables | Restricciones | Objetivo | Gap | Tiempo |"}[lang]
    rows = [h, "|---|---|---:|---:|---:|---:|---:|"]
    for label, r in ((("Monolithic x[s,p,r,k]", "Monolítico x[s,p,r,k]"), mono), (("Decomposed: stage A y[s,p,k]", "Descompuesto: etapa A y[s,p,k]"), a),
                     (("Decomposed: stage B z[s,r]", "Descompuesto: etapa B z[s,r]"), b)):
        rows.append(f"| {label[0 if lang == 'en' else 1]} | {r['solver']} | {r['n_vars']:,} | {r['n_cons']:,} | {r['objective']:.2f} | {100 * (r['gap'] or 0):.2f}% | {r['seconds']:.2f} s |")
    return "\n".join(rows)


if __name__ == "__main__":
    for lang in ("en", "es"):
        for fn in (phase1, headline, unserved, paired, sensitivity):
            print(f"<!-- {fn.__name__}_{lang} -->")
            print(fn(lang))
            print()
    best = R["best"]
    print("best:", best, "| tuned:", R["tuning"]["pfa_best"], R["tuning"]["dla_best"], "| dla solve:", R["dla_solve"])
    print("decomposed weighted:", P1["decomposed"]["breakdown"]["weighted_total"], "mono:", P1["monolithic"]["breakdown"])
