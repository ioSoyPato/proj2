import { useState } from "react";
import type { Analysis, PolicyKey } from "../lib/api";
import { POLICY_ORDER } from "../lib/api";
import { CLASS_NAMES, POLICY_CLASS, POLICY_NAMES, POLICY_SHORT, useLang, usePick } from "../lib/i18n";
import { ClassStrip, FanChart, IntervalPlot, WeightsChart, policyColor } from "./charts";
import { Callout, Panel, Stat, Swatch, Table, useFmt } from "./ui";

export function policyParams(a: Analysis, k: PolicyKey, tx: (en: string, es: string) => string, pct: (x: number, d?: number) => string): string {
  const p = a.profile;
  const b = pct(a.tuning.band_selected, 0);
  switch (k) {
    case "buy_hold": return tx("none", "ninguno");
    case "pfa_band": return `b = ${b}`;
    case "cfa_milp": return `L = ${a.tuning.cfa_selected.lookback} ${tx("mo", "m")}, θ = ${a.tuning.cfa_selected.theta}`;
    case "panic": return p.panic_drawdown >= 1 ? tx("never panics", "nunca entra en pánico") : `d = ${pct(p.panic_drawdown, 0)}, r = ${pct(p.reentry_recovery, 0)}`;
    case "chaser": return `k = ${pct(p.chase_intensity, 0)}, f = ${p.review_months} ${tx("mo", "m")}`;
    case "unassisted": return tx("d, r, k, f from the questionnaire", "d, r, k, f del cuestionario");
  }
}

// ------------------------------------------------------------------
export function RecommendationCard({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const pick = usePick();
  const { money, kmoney, pct } = useFmt();
  const rec = a.recommendation;
  const best = rec.policy;
  const s = a.evaluation.policies[best];
  const un = a.behavior_cost.unassisted;
  const ruleText =
    best === "buy_hold"
      ? tx("Buy these weights once and leave them alone. Do not trade on headlines.", "Compra estos pesos una vez y déjalos en paz. No operes por titulares.")
      : best === "pfa_band"
        ? tx(`Buy these weights; rebalance back only when a holding drifts more than ${pct(a.tuning.band_selected, 0)} from its target.`, `Compra estos pesos; rebalancea sólo cuando una posición se desvíe más de ${pct(a.tuning.band_selected, 0)} de su objetivo.`)
        : tx("Buy these weights; once a year, re-run the optimizer on the most recent data and move to its answer.", "Compra estos pesos; una vez al año, vuelve a correr el optimizador con los datos más recientes y muévete a su resultado.");
  return (
    <section className="panel" style={{ borderColor: "var(--ink)", borderWidth: 2 }}>
      <div className="small muted">{tx("Recommended decision", "Decisión recomendada")}</div>
      <h2 style={{ marginTop: "0.2rem", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <Swatch color={policyColor(best)} />
        {pick(POLICY_NAMES[best])}
        {rec.tied_with.length > 0 && (
          <span className="tag" style={{ fontSize: "0.8rem", fontWeight: 500 }}>
            {tx("statistically tied with", "estadísticamente empatada con")} {rec.tied_with.map((k) => pick(POLICY_NAMES[k])).join(", ")}
          </span>
        )}
      </h2>
      <p style={{ fontSize: "1.05rem", maxWidth: "46rem" }}>{ruleText}</p>
      <div className="stat-row" style={{ margin: "0.6rem 0 1rem" }}>
        <Stat label={tx("Median wealth in 10 years", "Riqueza mediana en 10 años")} value={kmoney(s.terminal_wealth.median)} hint={`${tx("from", "desde")} ${kmoney(a.settings.initial_wealth)}`} />
        <Stat label={tx("Bad case (1 in 20)", "Caso malo (1 de 20)")} value={kmoney(s.terminal_wealth.p5)} tone="loss" />
        <Stat label={tx("Good case (1 in 20)", "Caso bueno (1 de 20)")} value={kmoney(s.terminal_wealth.p95)} tone="gain" />
        <Stat label={tx("Chance of ending below the reference", "Probabilidad de terminar bajo la referencia")} value={pct(s.prob_below_reference)} hint={`${tx("reference", "referencia")} ${kmoney(a.settings.reference)}`} />
      </div>
      <Callout tone={un.median_wealth_diff < 0 ? "you" : "neutral"}>
        {tx(
          `The larger lever is behavior. Acting on your own tendencies (panic selling and chasing) changes the median outcome by ${kmoney(un.median_wealth_diff)} and the average by ${kmoney(un.wealth_diff.mean)} (95% CI ${kmoney(un.wealth_diff.ci_low)} to ${kmoney(un.wealth_diff.ci_high)}) compared with the same portfolio held with discipline.`,
          `La palanca más grande es el comportamiento. Actuar según tus propias tendencias (vender en pánico y perseguir rendimientos) cambia el resultado mediano en ${kmoney(un.median_wealth_diff)} y el promedio en ${kmoney(un.wealth_diff.mean)} (IC 95% ${kmoney(un.wealth_diff.ci_low)} a ${kmoney(un.wealth_diff.ci_high)}) frente al mismo portafolio sostenido con disciplina.`,
        )}
      </Callout>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{tx("Today's orders", "Órdenes de hoy")} ({money(a.settings.initial_wealth)})</summary>
        <Table
          leftCols={3}
          head={[tx("Ticker", "Ticker"), tx("Fund", "Fondo"), tx("Asset class", "Clase de activo"), tx("Weight", "Peso"), tx("Buy", "Comprar")]}
          rows={a.portfolio.holdings.map((h) => [<strong>{h.ticker}</strong>, h.name, pick(CLASS_NAMES[h.asset_class], h.asset_class), pct(h.weight), money(h.dollars)])}
        />
      </details>
    </section>
  );
}

// ------------------------------------------------------------------
export function PortfolioBlock({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const { pct } = useFmt();
  const p = a.portfolio;
  return (
    <Panel
      title={tx("The portfolio the optimizer built for this profile", "El portafolio que el optimizador construyó para este perfil")}
      sub={tx(
        `Mean-CVaR MILP. CVaR limit ${pct(p.cvar_cap)} per month, set by λ = ${a.profile.lam.toFixed(2)}. Solved by ${p.solver} in ${(p.solve_seconds * 1000).toFixed(0)} ms.`,
        `MILP media-CVaR. Límite de CVaR ${pct(p.cvar_cap)} mensual, fijado por λ = ${a.profile.lam.toFixed(2)}. Resuelto con ${p.solver} en ${(p.solve_seconds * 1000).toFixed(0)} ms.`,
      )}
    >
      <div className="grid2">
        <div>
          <WeightsChart holdings={p.holdings} />
        </div>
        <div>
          <ClassStrip byClass={p.by_class} />
          <div className="stat-row" style={{ marginTop: "1.2rem" }}>
            <Stat label={tx("Historical return, annualized", "Retorno histórico anualizado")} value={pct(p.expected_return_annual)} hint={tx(`shrunk estimate ${pct(p.expected_return_shrunk_annual)}`, `estimación encogida ${pct(p.expected_return_shrunk_annual)}`)} />
            <Stat label={tx("Volatility, annualized", "Volatilidad anualizada")} value={pct(p.volatility_annual)} />
            <Stat label={tx("Monthly CVaR 95%", "CVaR mensual 95%")} value={pct(p.cvar_monthly_empirical, 2)} hint={p.cap_binding ? tx("limit is binding", "el límite está activo") : tx("limit not binding", "el límite no está activo")} />
            <Stat label={tx("Funds held", "Fondos")} value={`${p.n_selected} / ${p.params.max_assets}`} hint="K" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------
export function FanBlock({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const pick = usePick();
  const [pol, setPol] = useState<PolicyKey>("unassisted");
  return (
    <Panel
      title={tx("Where 10 years could take you", "A dónde te pueden llevar 10 años")}
      sub={tx(
        `${a.evaluation.n} block-bootstrapped market histories, the same ones for every policy. The dashed line is the median of disciplined band rebalancing.`,
        `${a.evaluation.n} historias de mercado por bootstrap en bloques, las mismas para todas las políticas. La línea punteada es la mediana del rebalanceo disciplinado por bandas.`,
      )}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.6rem" }} role="group" aria-label={tx("Policy shown", "Política mostrada")}>
        {POLICY_ORDER.map((k) => (
          <button key={k} className="choice" aria-pressed={pol === k} onClick={() => setPol(k)}>
            <Swatch color={policyColor(k)} />{pick(POLICY_NAMES[k])}
          </button>
        ))}
      </div>
      <FanChart a={a} policy={pol} compare={pol === "pfa_band" ? undefined : "pfa_band"} />
    </Panel>
  );
}

// ------------------------------------------------------------------
export function BehaviorCostBlock({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const pick = usePick();
  const { kmoney, signedK, pct } = useFmt();
  const keys = ["panic", "chaser", "unassisted"] as const;
  const p = a.profile;
  const rows = keys.map((k) => ({
    key: k, label: pick(POLICY_NAMES[k]), color: policyColor(k),
    mean: a.behavior_cost[k].wealth_diff.mean, lo: a.behavior_cost[k].wealth_diff.ci_low, hi: a.behavior_cost[k].wealth_diff.ci_high,
  }));
  const panicTxt = p.panic_drawdown >= 1
    ? tx("You said you would buy more after a 20% fall, so the simulated you never panic-sells.", "Dijiste que comprarías más tras una caída de 20%, así que el tú simulado nunca vende en pánico.")
    : tx(`The simulated you sells everything after a ${pct(p.panic_drawdown, 0)} fall from the peak and buys back after a ${pct(p.reentry_recovery, 0)} rebound. That happened in ${pct(a.behavior_cost.panic.share_affected, 0)} of the histories and cost ${kmoney(a.behavior_cost.panic.median_wealth_diff)} at the median.`,
      `El tú simulado vende todo tras una caída de ${pct(p.panic_drawdown, 0)} desde el máximo y recompra tras un rebote de ${pct(p.reentry_recovery, 0)}. Eso ocurrió en ${pct(a.behavior_cost.panic.share_affected, 0)} de las historias y costó ${kmoney(a.behavior_cost.panic.median_wealth_diff)} en la mediana.`);
  const chaseTxt = p.chase_intensity <= 0
    ? tx("You said you would not chase last year's winners, so that tendency costs nothing here.", "Dijiste que no perseguirías a los ganadores del año pasado, así que esa tendencia no cuesta nada aquí.")
    : tx(`Every ${p.review_months} months the simulated you moves ${pct(p.chase_intensity, 0)} of the portfolio into last year's three best funds.`,
      `Cada ${p.review_months} meses el tú simulado mueve ${pct(p.chase_intensity, 0)} del portafolio a los tres mejores fondos del último año.`);
  return (
    <Panel
      title={tx("What your tendencies cost", "Lo que te cuestan tus tendencias")}
      sub={tx("Terminal wealth minus disciplined band rebalancing, scenario by scenario (same markets). Dot = mean, bar = 95% confidence interval.", "Riqueza final menos el rebalanceo disciplinado por bandas, escenario por escenario (mismos mercados). Punto = media, barra = intervalo de confianza de 95%.")}
    >
      <div className="stat-row" style={{ marginBottom: "0.8rem" }}>
        {keys.map((k) => (
          <Stat key={k} label={`${pick(POLICY_NAMES[k])}: ${tx("median change", "cambio en la mediana")}`} value={signedK(a.behavior_cost[k].median_wealth_diff)}
            tone={a.behavior_cost[k].median_wealth_diff < -1 ? "loss" : undefined}
            hint={`${tx("in felt-value terms", "en valor percibido")}: ${signedK(a.behavior_cost[k].pt_ce_diff)}`} />
        ))}
      </div>
      <IntervalPlot rows={rows} format={signedK} zeroLabel={tx("no cost", "sin costo")} />
      <p className="small" style={{ marginTop: "0.6rem", maxWidth: "46rem" }}>{panicTxt} {chaseTxt}</p>
      <p className="small muted" style={{ maxWidth: "46rem" }}>
        {tx("\"Felt value\" is the certainty equivalent under your own value function: the sure amount you would consider as good as the whole uncertain outcome.", "El \"valor percibido\" es el equivalente cierto bajo tu propia función de valor: la cantidad segura que considerarías igual de buena que todo el resultado incierto.")}
      </p>
    </Panel>
  );
}

// ------------------------------------------------------------------
export function ComparisonTable({ a, metric }: { a: Analysis; metric: "wealth" | "pt" }) {
  const { tx } = useLang();
  const pick = usePick();
  const { kmoney, num, pct } = useFmt();
  const rec = a.recommendation.policy;
  const rows = POLICY_ORDER.map((k) => {
    const s = a.evaluation.policies[k];
    const d = metric === "wealth" ? s.terminal_wealth : s.pt_value;
    const f = metric === "wealth" ? kmoney : (x: number) => num(x, 3);
    return [
      <span><Swatch color={policyColor(k)} />{pick(POLICY_NAMES[k])}</span>,
      <span className="tag">{pick(POLICY_CLASS[s.class], s.class)}</span>,
      policyParams(a, k, tx, pct),
      f(d.mean), f(d.std), f(d.p5), f(d.median), f(d.p95), `${f(d.ci_low)} – ${f(d.ci_high)}`,
    ];
  });
  return (
    <Table
      leftCols={3}
          head={[tx("Policy", "Política"), tx("Class", "Clase"), tx("Parameters", "Parámetros"), tx("Mean", "Media"), tx("Std", "Desv. est."), "P5", tx("Median", "Mediana"), "P95", tx("95% CI of mean", "IC 95% de la media")]}
      rows={rows}
      highlight={POLICY_ORDER.indexOf(rec)}
    />
  );
}

export function PlainLanguage({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const pick = usePick();
  const { kmoney, pct } = useFmt();
  return (
    <div className="grid3">
      {POLICY_ORDER.map((k) => {
        const s = a.evaluation.policies[k];
        return (
          <div key={k} style={{ borderTop: `3px solid ${policyColor(k)}`, paddingTop: "0.6rem" }}>
            <div style={{ fontWeight: 700 }}>{pick(POLICY_NAMES[k])}</div>
            <div className="small muted" style={{ marginBottom: "0.4rem" }}>{pick(POLICY_SHORT[k])}</div>
            <div className="small">
              {tx(
                `Typically ends near ${kmoney(s.terminal_wealth.median)}; 1 time in 20 below ${kmoney(s.terminal_wealth.p5)}, 1 in 20 above ${kmoney(s.terminal_wealth.p95)}. Worst fall along the way: ${pct(s.max_drawdown.mean, 0)} on average.`,
                `Normalmente termina cerca de ${kmoney(s.terminal_wealth.median)}; 1 de cada 20 veces bajo ${kmoney(s.terminal_wealth.p5)}, 1 de cada 20 sobre ${kmoney(s.terminal_wealth.p95)}. Peor caída en el camino: ${pct(s.max_drawdown.mean, 0)} en promedio.`,
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
