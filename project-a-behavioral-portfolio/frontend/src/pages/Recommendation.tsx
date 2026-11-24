import type { Analysis, PolicyKey } from "../lib/api";
import { L, POLICY_NAMES, useLang, usePick } from "../lib/i18n";
import type { PageKey } from "../components/Nav";
import { HeatTable, SweepChart } from "../components/charts";
import { RecommendationCard } from "../components/Results";
import { Callout, Panel, Table, useFmt } from "../components/ui";

const OPT: PolicyKey[] = ["buy_hold", "pfa_band", "cfa_milp"];

export function Recommendation({ a, go }: { a: Analysis; go: (p: PageKey) => void }) {
  const { tx } = useLang();
  const pick = usePick();
  const { pct, num, kmoney } = useFmt();
  const S = a.sensitivity;
  const rec = a.recommendation.policy;
  const name = (k: PolicyKey) => pick(POLICY_NAMES[k]);

  if (!S) return <RecommendationCard a={a} />;

  const lamFlips = S.lambda.filter((r) => r.best !== rec);
  const lamTie = lamFlips.every((r) => Math.abs(r.scores[r.best].mean_pt - r.scores[rec].mean_pt) < r.scores[r.best].ci_half);
  const costFlips = S.cost.filter((r) => r.best !== rec);
  const refFlips = S.reference.filter((r) => r.best !== rec);
  const cfaNeverBest = [...S.lambda, ...S.cost, ...S.reference].every((r) => r.best !== "cfa_milp");
  const p = a.profile;

  return (
    <div>
      <h1>{tx("Recommendation", "Recomendación")}</h1>
      <p className="lede">
        <L
          en="What we would tell the default client, why, and the conditions under which the advice would change, backed by sensitivity runs on a third random seed."
          es="Lo que le diríamos al cliente por defecto, por qué, y las condiciones bajo las cuales el consejo cambiaría, respaldado por corridas de sensibilidad con una tercera semilla aleatoria."
        />
      </p>
      <RecommendationCard a={a} />

      <h2>{tx("Why", "Por qué")}</h2>
      <ol className="prose" style={{ paddingLeft: "1.2rem" }}>
        <li>
          {tx(
            `${name(rec)} has the highest expected prospect-theory value among the disciplined policies (${num(a.evaluation.policies[rec].pt_value.mean, 3)}, 95% CI ${num(a.evaluation.policies[rec].pt_value.ci_low, 3)} to ${num(a.evaluation.policies[rec].pt_value.ci_high, 3)}).`,
            `${name(rec)} tiene el mayor valor esperado de teoría prospectiva entre las políticas disciplinadas (${num(a.evaluation.policies[rec].pt_value.mean, 3)}, IC 95% ${num(a.evaluation.policies[rec].pt_value.ci_low, 3)} a ${num(a.evaluation.policies[rec].pt_value.ci_high, 3)}).`,
          )}
          {a.recommendation.tied_with.length > 0 &&
            " " + tx(
              `It is statistically tied with ${a.recommendation.tied_with.map(name).join(", ")}: the paired confidence interval of the difference contains zero. Either is a sound choice; the tuned band is so wide that the two rarely differ.`,
              `Está estadísticamente empatada con ${a.recommendation.tied_with.map(name).join(", ")}: el intervalo de confianza pareado de la diferencia contiene al cero. Cualquiera es una buena elección; la banda calibrada es tan amplia que rara vez difieren.`,
            )}
        </li>
        <li>
          {tx(
            `Annual re-optimization (CFA) is worse on the same scenarios: re-estimating means from a trailing window adds noise and turnover (${pct(a.evaluation.policies.cfa_milp.annual_turnover, 0)} a year) without adding information.`,
            `La re-optimización anual (CFA) es peor en los mismos escenarios: re-estimar medias con una ventana móvil agrega ruido y rotación (${pct(a.evaluation.policies.cfa_milp.annual_turnover, 0)} al año) sin agregar información.`,
          )}
        </li>
        <li>
          {tx(
            `The decisive risk is the client, not the strategy: the client's own tendencies cost a median ${kmoney(a.behavior_cost.unassisted.median_wealth_diff)} over ten years. The advisory value is in pre-committing to the rule (automatic contributions and rebalancing, a written plan for a 20% fall, no chasing reviews more than once a year).`,
            `El riesgo decisivo es el cliente, no la estrategia: sus propias tendencias cuestan una mediana de ${kmoney(a.behavior_cost.unassisted.median_wealth_diff)} en diez años. El valor de la asesoría está en comprometerse de antemano con la regla (aportaciones y rebalanceo automáticos, un plan escrito para una caída de 20%, no revisar para perseguir rendimientos más de una vez al año).`,
          )}
        </li>
      </ol>

      <h2>{tx("When the recommendation would change", "Cuándo cambiaría la recomendación")}</h2>
      <Callout tone="you">
        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
          <li>
            {lamFlips.length
              ? tx(
                  `Loss aversion: for λ ≤ ${Math.max(...lamFlips.map((r) => r.lam)).toFixed(1)} the best policy becomes ${name(lamFlips[0].best)} (the portfolio holds more equity and a narrower band of ${pct(lamFlips[0].band, 0)} pays). ${lamTie ? "The margin is within the confidence interval, so it is a tie rather than a reversal." : "The margin exceeds the confidence interval."}`,
                  `Aversión a pérdidas: para λ ≤ ${Math.max(...lamFlips.map((r) => r.lam)).toFixed(1)} la mejor política pasa a ser ${name(lamFlips[0].best)} (el portafolio tiene más renta variable y conviene una banda más estrecha de ${pct(lamFlips[0].band, 0)}). ${lamTie ? "El margen está dentro del intervalo de confianza: es un empate, no una reversión." : "El margen supera el intervalo de confianza."}`,
                )
              : tx("Loss aversion: the ranking does not change for λ from 1 to 5.", "Aversión a pérdidas: el orden no cambia para λ de 1 a 5.")}
          </li>
          <li>
            {costFlips.length
              ? tx(`Trading costs: the ranking changes at ${costFlips.map((r) => `${r.cost * 1e4} bp`).join(", ")}.`, `Costos de transacción: el orden cambia en ${costFlips.map((r) => `${r.cost * 1e4} pb`).join(", ")}.`)
              : tx(`Trading costs: the ranking holds from 0 to 100 bp; higher costs only widen the gap against the CFA.`, `Costos de transacción: el orden se mantiene de 0 a 100 pb; costos mayores sólo amplían la brecha contra la CFA.`)}
          </li>
          <li>
            {refFlips.length
              ? tx(`Reference point: the ranking changes for growth targets of ${refFlips.map((r) => pct(r.target_growth, 0)).join(", ")}.`, `Punto de referencia: el orden cambia para metas de ${refFlips.map((r) => pct(r.target_growth, 0)).join(", ")}.`)
              : tx("Reference point: the ranking holds for growth targets from 0% to 8% a year, although the chance of ending below an 8% target rises to " + pct(S.reference[S.reference.length - 1].prob_below_reference[rec], 0) + ".", "Punto de referencia: el orden se mantiene para metas de 0% a 8% anual, aunque la probabilidad de terminar bajo una meta de 8% sube a " + pct(S.reference[S.reference.length - 1].prob_below_reference[rec], 0) + ".")}
          </li>
          {cfaNeverBest && (
            <li>{tx("The CFA would only win with better return forecasts than trailing means, or in a market whose regime changes faster than the bootstrap blocks allow.", "La CFA sólo ganaría con mejores pronósticos de retorno que las medias móviles, o en un mercado cuyo régimen cambie más rápido de lo que permiten los bloques del bootstrap.")}</li>
          )}
          <li>{tx("If the client cannot commit to the rule, the recommendation is less about which rule and more about removing discretion: the behavior grids below show how quickly the cost grows.", "Si el cliente no puede comprometerse con la regla, la recomendación es menos sobre cuál regla y más sobre quitar discrecionalidad: las rejillas de abajo muestran qué tan rápido crece el costo.")}</li>
        </ul>
      </Callout>

      <Panel title={tx("Sensitivity to loss aversion λ", "Sensibilidad a la aversión a pérdidas λ")}
        sub={tx("For each λ: new CVaR limit, new MILP portfolio, re-tuned band, 500 scenarios (sensitivity seed). Values are on each λ's own PT scale.", "Para cada λ: nuevo límite de CVaR, nuevo portafolio MILP, banda recalibrada, 500 escenarios (semilla de sensibilidad). Valores en la escala PT de cada λ.")}>
        <SweepChart rows={S.lambda.map((r) => ({ x: r.lam, scores: r.scores }))} xKey="lam" xLabel="λ" xFormat={(v) => `λ=${v}`} policies={OPT} />
        <Table
          head={["λ", tx("CVaR limit", "Límite CVaR"), tx("Equity share", "Renta variable"), tx("Tuned band", "Banda calibrada"), tx("Best policy", "Mejor política"), tx("Median wealth (best)", "Riqueza mediana (mejor)"), tx("Cost of unassisted behavior (median)", "Costo del comportamiento sin asesoría (mediana)")]}
          rows={S.lambda.map((r) => [num(r.lam, 1), pct(r.cvar_cap, 1), pct(r.equity_share, 0), pct(r.band, 0), name(r.best), kmoney(r.scores[r.best].median_wealth), kmoney(r.unassisted_median_cost)])}
          highlight={S.lambda.findIndex((r) => Math.abs(r.lam - p.lam) === Math.min(...S.lambda.map((q) => Math.abs(q.lam - p.lam))))}
        />
      </Panel>

      <div>
        <Panel title={tx("Sensitivity to trading costs", "Sensibilidad a los costos de transacción")}>
          <Table
            head={[tx("Cost", "Costo"), ...OPT.map(name), tx("Best", "Mejor")]}
            rows={S.cost.map((r) => [`${num(r.cost * 1e4, 0)} bp`, ...OPT.map((k) => num(r.scores[k].mean_pt, 3)), name(r.best)])}
          />
        </Panel>
        <Panel title={tx("Sensitivity to the reference point", "Sensibilidad al punto de referencia")}>
          <Table
            head={[tx("Target g", "Meta g"), tx("Reference", "Referencia"), ...OPT.map(name), tx("Best", "Mejor")]}
            rows={S.reference.map((r) => [pct(r.target_growth, 0), kmoney(r.reference), ...OPT.map((k) => num(r.scores[k].mean_pt, 3)), name(r.best)])}
          />
        </Panel>
      </div>

      <Panel title={tx("Cost of panic selling: median change in terminal wealth vs disciplined", "Costo de vender en pánico: cambio en la riqueza final mediana vs disciplinado")}
        sub={tx("Rows: drawdown that triggers the sale. Columns: rebound needed to buy back. Outlined: the default client.", "Filas: caída que dispara la venta. Columnas: rebote necesario para recomprar. Remarcado: el cliente por defecto.")}>
        <HeatTable rowsKey="d" colsKey="r" rowVals={[0.1, 0.15, 0.2, 0.25, 0.3, 0.35]} colVals={[0.05, 0.1, 0.2, 0.3]} cells={S.panic}
          rowLabel="d" colLabel="r" fmtRow={(v) => pct(v, 0)} fmtCol={(v) => pct(v, 0)} highlight={[p.panic_drawdown, p.reentry_recovery]} />
      </Panel>
      <Panel title={tx("Cost of performance chasing: median change in terminal wealth vs disciplined", "Costo de perseguir rendimientos: cambio en la riqueza final mediana vs disciplinado")}
        sub={tx("Rows: share k moved into the trailing top 3. Columns: review period f in months.", "Filas: fracción k movida a los 3 mejores recientes. Columnas: periodo de revisión f en meses.")}>
        <HeatTable rowsKey="k" colsKey="f" rowVals={[0.25, 0.5, 0.75, 1]} colVals={[1, 3, 6, 12]} cells={S.chase}
          rowLabel="k" colLabel="f" fmtRow={(v) => pct(v, 0)} fmtCol={(v) => `${v} ${tx("mo", "m")}`} highlight={[p.chase_intensity, p.review_months]} />
        <p className="small muted" style={{ marginTop: "0.6rem" }}>
          {tx("Caveat: the bootstrap keeps momentum only within 3–6 month blocks, so 12-month winners carry little information in the simulation. That makes chasing look at least as bad as it would in markets with some medium-term momentum.", "Advertencia: el bootstrap conserva la persistencia sólo dentro de bloques de 3–6 meses, así que los ganadores de 12 meses llevan poca información en la simulación. Eso hace que perseguir rendimientos se vea al menos tan mal como se vería en mercados con algo de momentum de mediano plazo.")}
        </p>
      </Panel>
      <p><button className="btn" onClick={() => go("advisor")}>{tx("Run this for a real client", "Correr esto para un cliente real")}</button></p>
    </div>
  );
}
