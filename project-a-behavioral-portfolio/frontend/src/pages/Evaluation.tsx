import { useState } from "react";
import type { Analysis } from "../lib/api";
import { POLICY_ORDER } from "../lib/api";
import { L, POLICY_NAMES, useLang, usePick } from "../lib/i18n";
import { IntervalPlot, TerminalHistogram, policyColor } from "../components/charts";
import { BehaviorCostBlock, ComparisonTable, FanBlock } from "../components/Results";
import { Panel, Swatch, Table, useFmt } from "../components/ui";

export function Evaluation({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const pick = usePick();
  const { kmoney, num, pct, money } = useFmt();
  const [metric, setMetric] = useState<"wealth" | "pt">("wealth");
  const P = a.evaluation.policies;
  const rec = a.recommendation;
  return (
    <div>
      <h1>{tx("Evaluation", "Evaluación")}</h1>
      <p className="lede">
        <L
          en={`All six policies live through the same ${a.evaluation.n} ten-year histories (common random numbers, seed ${a.evaluation.seed}). Tuning used ${a.tuning.n} different histories (seed ${a.tuning.seed}). Because the scenarios are shared, differences between policies are measured scenario by scenario, which makes the comparison far more precise than two independent samples.`}
          es={`Las seis políticas viven las mismas ${a.evaluation.n} historias de diez años (números aleatorios comunes, semilla ${a.evaluation.seed}). La calibración usó ${a.tuning.n} historias distintas (semilla ${a.tuning.seed}). Como los escenarios son compartidos, las diferencias entre políticas se miden escenario por escenario, lo que hace la comparación mucho más precisa que dos muestras independientes.`}
        />
      </p>

      <Panel title={tx("Main metric and spread", "Métrica principal y dispersión")}
        sub={tx("95% CI of the mean: mean ± 1.96 · std / √n. P5 and P95 are the 5th and 95th percentiles across scenarios.", "IC 95% de la media: media ± 1.96 · desv / √n. P5 y P95 son los percentiles 5 y 95 entre escenarios.")}>
        <div className="seg" role="group" style={{ marginBottom: "0.8rem" }}>
          <button aria-pressed={metric === "wealth"} onClick={() => setMetric("wealth")}>{tx("Terminal wealth ($)", "Riqueza final ($)")}</button>
          <button aria-pressed={metric === "pt"} onClick={() => setMetric("pt")}>{tx("Prospect-theory value (objective)", "Valor de teoría prospectiva (objetivo)")}</button>
        </div>
        <ComparisonTable a={a} metric={metric} />
      </Panel>

      <Panel title={tx("Mean PT value with 95% confidence intervals", "Valor PT medio con intervalos de confianza de 95%")}>
        <IntervalPlot
          rows={POLICY_ORDER.map((k) => ({ key: k, label: pick(POLICY_NAMES[k]), color: policyColor(k), mean: P[k].pt_value.mean, lo: P[k].pt_value.ci_low, hi: P[k].pt_value.ci_high }))}
          format={(x) => num(x, 3)}
          includeZero={false}
        />
      </Panel>

      <Panel title={tx("Paired differences against the recommended policy", "Diferencias pareadas contra la política recomendada")}
        sub={tx(`${pick(POLICY_NAMES[rec.policy])} minus each alternative, scenario by scenario. A CI that contains zero means the two cannot be told apart with ${a.evaluation.n} scenarios.`, `${pick(POLICY_NAMES[rec.policy])} menos cada alternativa, escenario por escenario. Un IC que contiene el cero significa que no se pueden distinguir con ${a.evaluation.n} escenarios.`)}>
        <Table
          head={[tx("vs", "vs"), tx("PT diff, mean [95% CI]", "Dif. PT, media [IC 95%]"), tx("Wealth diff, mean [95% CI]", "Dif. riqueza, media [IC 95%]"), tx("Scenarios where recommended is strictly better", "Escenarios donde la recomendada es estrictamente mejor")]}
          rows={Object.entries(rec.comparisons).map(([k, c]) => [
            pick(POLICY_NAMES[k as keyof typeof POLICY_NAMES]),
            `${num(c.pt_diff.mean, 4)} [${num(c.pt_diff.ci_low, 4)}, ${num(c.pt_diff.ci_high, 4)}]`,
            `${kmoney(c.wealth_diff.mean)} [${kmoney(c.wealth_diff.ci_low)}, ${kmoney(c.wealth_diff.ci_high)}]`,
            pct(c.pt_diff.share_positive ?? 0, 0),
          ])}
        />
      </Panel>

      <FanBlock a={a} />

      <Panel title={tx("Distribution of terminal wealth", "Distribución de la riqueza final")} sub={tx("Number of scenarios per wealth bin. The dashed line is the reference point.", "Número de escenarios por intervalo de riqueza. La línea punteada es el punto de referencia.")}>
        <TerminalHistogram a={a} policies={["buy_hold", "cfa_milp", "unassisted"]} />
      </Panel>

      <BehaviorCostBlock a={a} />

      <Panel title={tx("Risk, trading and felt value", "Riesgo, operación y valor percibido")}>
        <Table
          head={[tx("Policy", "Política"), tx("Avg. max drawdown", "Caída máx. promedio"), tx("P(below start)", "P(bajo el inicio)"), tx("Turnover / year", "Rotación / año"), tx("Costs paid", "Costos pagados"), tx("Months in cash", "Meses en efectivo"), tx("Certainty equivalent", "Equivalente cierto")]}
          rows={POLICY_ORDER.map((k) => [
            <span><Swatch color={policyColor(k)} />{pick(POLICY_NAMES[k])}</span>,
            pct(P[k].max_drawdown.mean), pct(P[k].prob_loss), pct(P[k].annual_turnover, 0), money(P[k].mean_costs), num(P[k].mean_cash_months, 1), kmoney(P[k].pt_certainty_equivalent),
          ])}
        />
      </Panel>
    </div>
  );
}
