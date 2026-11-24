import type { PolicyKey, Study } from "../lib/api";
import { useLang } from "../lib/i18n";
import { kMoney, num, pct, signedPct } from "../lib/format";
import { policyOneLiner } from "../lib/explain";
import { Panel, PolicyName } from "./ui";
import { PricePaths, RangeStrips, RevenueHistogram, SeatsPaths, SelloutBars } from "./charts";

export function ResultsTable({ study }: { study: Study }) {
  const { t, lang } = useLang();
  const rec = study.recommendation.policy;
  const keys = study.order;
  return (
    <div className="scrollx">
      <table className="t">
        <thead>
          <tr>
            <th>{t("m.policy")}</th>
            <th>{t("m.mean")}</th>
            <th>{t("m.ci")}</th>
            <th>{t("m.std")}</th>
            <th>{t("m.p5")}</th>
            <th>{t("m.p95")}</th>
            <th>{t("m.sellout")}</th>
            <th>{t("m.vsfixed")}</th>
            <th>{t("m.win")}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const s = study.policies[k]!.summary;
            const g = s.paired_vs_fixed;
            const ood = k === "rl" && study.rl.ood;
            return (
              <tr key={k} className={k === rec ? "rec" : undefined}>
                <td>
                  <PolicyName k={k} rec={k === rec} />
                  {ood && <span className="chip warn" style={{ marginLeft: 6 }}>{t("ood.flag")}</span>}
                </td>
                <td><strong>{kMoney(s.revenue.mean, lang)}</strong></td>
                <td>{kMoney(s.revenue.ci95[0], lang)} – {kMoney(s.revenue.ci95[1], lang)}</td>
                <td>{kMoney(s.revenue.std, lang)}</td>
                <td>{kMoney(s.revenue.p5, lang)}</td>
                <td>{kMoney(s.revenue.p95, lang)}</td>
                <td>{pct(s.sellout.prob, lang)}</td>
                <td>{g ? `${signedPct(g.pct, lang)}` : "—"}</td>
                <td>{g ? pct(g.win_rate, lang) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PlainComparison({ study }: { study: Study }) {
  const { lang, t, p } = useLang();
  return (
    <div style={{ display: "grid", gap: "0.7rem" }}>
      {study.order.map((k: PolicyKey) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0,12rem) minmax(0,1fr)", gap: "0.8rem" }} className="plain-row">
          <div><PolicyName k={k} rec={k === study.recommendation.policy} /></div>
          <div className="small" style={{ color: "var(--ink-soft)" }}>
            {policyOneLiner(k, study, lang)}
            {k === "rl" && study.rl.ood && (
              <> {p("Its training market differs from these inputs, so treat this number with caution; it is never recommended in that case.",
                "Su mercado de entrenamiento difiere de estas entradas, así que este número debe tomarse con cautela; en ese caso nunca se recomienda.")}</>
            )}
          </div>
        </div>
      ))}
      {study.rl && !study.rl.included && (
        <p className="small muted">
          {t("policy.rl")}: {t("ood.excluded")} —{" "}
          {study.rl.reason === "different_action_space_or_horizon"
            ? p("the agent was trained for a 60-day window and the $40–$200 grid in $10 steps; it cannot act on a different grid or window without retraining.",
                "el agente se entrenó para una ventana de 60 días y la rejilla de $40–$200 en pasos de $10; no puede actuar con otra rejilla o ventana sin reentrenarse.")
            : p("no trained weights found (run scripts/train_rl.py).", "no se encontraron pesos entrenados (ejecuta scripts/train_rl.py).")}
        </p>
      )}
    </div>
  );
}

export function ResultsBlock({ study, showSeats = true }: { study: Study; showSeats?: boolean }) {
  const { t, lang, p } = useLang();
  const keys = study.order;
  const rec = study.recommendation.policy;
  const n = study.seeds.n_eval;
  return (
    <>
      <Panel title={p("Head to head", "Frente a frente")}
        sub={p(`${num(n, lang)} selling seasons, identical for every policy (common random numbers). Highlighted row = recommended.`,
          `${num(n, lang)} temporadas de venta, idénticas para todas las políticas (números aleatorios comunes). Fila resaltada = recomendada.`)}>
        <ResultsTable study={study} />
      </Panel>
      <Panel title={p("In plain words", "En palabras simples")}>
        <PlainComparison study={study} />
      </Panel>
      <div className="grid2">
        <Panel title={p("How much could the night bring in?", "¿Cuánto podría recaudar la noche?")}
          sub={p("Revenue spread across scenarios", "Dispersión del ingreso entre escenarios")}>
          <RangeStrips study={study} keys={keys} rec={rec} />
        </Panel>
        <Panel title={t("m.sellout")} sub={p("Share of seasons where every seat sells", "Proporción de temporadas en que se venden todos los asientos")}>
          <SelloutBars study={study} keys={keys} />
        </Panel>
      </div>
      <Panel title={p("Price path", "Trayectoria de precios")}
        sub={p("Average posted price by day for each policy; the shaded band shows how much the recommended policy adapts across scenarios.",
          "Precio publicado promedio por día para cada política; la banda sombreada muestra cuánto se adapta la política recomendada entre escenarios.")}>
        <PricePaths study={study} keys={keys} band={rec === "fixed" ? undefined : rec} plan={study.dla_plan_day0} />
      </Panel>
      <div className="grid2">
        <Panel title={p("Revenue distribution", "Distribución del ingreso")}>
          <RevenueHistogram study={study} keys={keys} />
        </Panel>
        {showSeats && (
          <Panel title={p("Seats left, on average", "Asientos restantes, en promedio")}
            sub={p("Dashed line: scarcity threshold (10% of capacity).", "Línea punteada: umbral de escasez (10% de la capacidad).")}>
            <SeatsPaths study={study} keys={keys} />
          </Panel>
        )}
      </div>
    </>
  );
}
