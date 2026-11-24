import { useState } from "react";
import { api, type PolicyKey, type Sensitivity, type SweepRow } from "../lib/api";
import { useData } from "../lib/data";
import { useLang } from "../lib/i18n";
import { kMoney, num, pct, signedPct } from "../lib/format";
import { CalibrationBanner, ErrorBox, Loading, Panel, PolicyName } from "../components/ui";
import { SweepChart } from "../components/charts";
import { changeConditions, sweepName } from "./Overview";

function SweepTable({ rows, keys }: { rows: SweepRow[]; keys: PolicyKey[] }) {
  const { lang, p, t } = useLang();
  return (
    <div className="scrollx">
      <table className="t">
        <thead>
          <tr>
            <th>{p("Value", "Valor")}</th>
            {keys.map((k) => <th key={k}>{t(`policy.${k}.short`)}</th>)}
            <th>{p("Best fixed $", "Mejor fijo $")}</th>
            <th>{p("Recommended", "Recomendada")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value}>
              <td>{r.value}</td>
              {keys.map((k) => {
                const v = r.policies[k];
                return (
                  <td key={k} style={k === r.recommended ? { fontWeight: 700 } : undefined}>
                    {v ? kMoney(v.mean, lang) : "—"}
                    {v?.gain_vs_fixed && <span className="small muted"> ({signedPct(v.gain_vs_fixed.pct, lang)})</span>}
                    {k === "rl" && r.rl_ood && <span className="small" style={{ color: "var(--rose)" }}> *</span>}
                  </td>
                );
              })}
              <td>${r.fixed_price}</td>
              <td><PolicyName k={r.recommended} short /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SWEEP_INTRO: Record<string, [string, string]> = {
  eta: ["How much a price above the reference price hurts. At η = 0.6 a $10 surcharge over what fans expect feels like $16.",
    "Cuánto duele un precio por encima del de referencia. Con η = 0.6 un recargo de $10 sobre lo esperado se siente como $16."],
  theta: ["How slowly fans update their reference price. θ = 0.95 means a price change takes weeks to be accepted as normal.",
    "Qué tan lento actualiza el público su precio de referencia. θ = 0.95 significa que un cambio de precio tarda semanas en aceptarse como normal."],
  demand_scale: ["Total potential buyers relative to the default 5,200 — a weaker or stronger act than planned.",
    "Compradores potenciales totales relativos a los 5,200 base — un artista más débil o más fuerte de lo planeado."],
  demand_sigma: ["How uncertain the promoter is about the overall demand level before sales start.",
    "Qué tan incierto es para el promotor el nivel total de demanda antes de empezar a vender."],
  gamma: ["How much a price below the reference attracts extra buyers.", "Cuánto atrae compradores extra un precio por debajo de la referencia."],
};

export function SensitivityPage() {
  const { pre, error, reload, market } = useData();
  const { p, lang } = useLang();
  const [param, setParam] = useState<"eta" | "theta" | "gamma" | "demand_scale">("eta");
  const [liveRes, setLiveRes] = useState<Sensitivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (error) return <ErrorBox msg={error} onRetry={reload} />;
  if (!pre || !market) return <Loading />;
  const sens = pre.sensitivity;
  const keysOf = (rows: SweepRow[]) => (["fixed", "pfa", "dla", "rl"] as PolicyKey[]).filter((k) => rows.some((r) => r.policies[k]));

  const runLive = async () => {
    setBusy(true); setErr(null);
    try { setLiveRes(await api.sensitivity(market, param, 60)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <CalibrationBanner />
      <h1>{p("How fragile is the advice?", "¿Qué tan frágil es el consejo?")}</h1>
      <p className="lede">
        {p("The reference-price effect is the assumption a promoter can least observe. Below, each assumption is moved one at a time and every policy is re-run on the same scenarios.",
          "El efecto del precio de referencia es el supuesto que el promotor menos puede observar. Abajo, cada supuesto se mueve uno a la vez y cada política se vuelve a correr en los mismos escenarios.")}
      </p>
      {sens ? (
        <>
          <Panel title={p("Summary", "Resumen")}>
            <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
              {changeConditions(pre, lang).map((s, i) => <li key={i} style={{ marginBottom: "0.35rem" }}>{s}</li>)}
            </ul>
            <p className="small muted" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
              {p(`${num(sens.n_scenarios, lang)} scenarios per point (own seed family). Fixed price re-optimised and the rule re-tuned on tuning seeds for each point; the lookahead reads the new model; the RL agent keeps its default-market weights (* = outside its training range, never recommended there).`,
                `${num(sens.n_scenarios, lang)} escenarios por punto (familia de semillas propia). En cada punto se re-optimiza el precio fijo y se re-ajusta la regla con semillas de ajuste; la anticipación lee el nuevo modelo; el agente RL conserva sus pesos del mercado base (* = fuera de su rango de entrenamiento, ahí nunca se recomienda).`)}
            </p>
          </Panel>
          {Object.entries(sens.sweeps).map(([k, rows]) => (
            <Panel key={k} title={sweepName(k, lang)} sub={SWEEP_INTRO[k] ? p(...SWEEP_INTRO[k]) : undefined}>
              <SweepChart rows={rows} keys={keysOf(rows)} xLabel={sweepName(k, lang)} />
              <SweepTable rows={rows} keys={keysOf(rows)} />
            </Panel>
          ))}
        </>
      ) : (
        <p className="muted">{p("No precomputed sweeps. Run scripts/precompute.py.", "No hay barridos precalculados. Ejecuta scripts/precompute.py.")}</p>
      )}

      <h2>{p("Sweep your own market", "Barre tu propio mercado")}</h2>
      <p>{p("Uses the inputs from “Plan your sale” and 60 scenarios per point. Takes about a minute because the lookahead is re-solved every day of every scenario.",
        "Usa las entradas de “Planea tu venta” y 60 escenarios por punto. Tarda cerca de un minuto porque la anticipación se re-resuelve cada día de cada escenario.")}</p>
      <Panel>
        <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "center" }}>
          <div className="seg" role="group" aria-label={p("Parameter", "Parámetro")}>
            {(["eta", "theta", "gamma", "demand_scale"] as const).map((k) => (
              <button key={k} aria-pressed={param === k} onClick={() => setParam(k)}>{sweepName(k, lang)}</button>
            ))}
          </div>
          <button className="btn" onClick={runLive} disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden /> {p("Sweeping…", "Barriendo…")}</> : p("Run sweep", "Correr barrido")}
          </button>
        </div>
        {err && <p className="small" style={{ color: "var(--rose)" }}>{err}</p>}
        {liveRes && Object.entries(liveRes.sweeps).map(([k, rows]) => (
          <div key={k} style={{ marginTop: "1rem" }}>
            <p className="small muted">{p("Live sweep", "Barrido en vivo")} · {num(liveRes.n_scenarios, lang)} {p("scenarios per point", "escenarios por punto")} · {liveRes.seconds?.toFixed(0)} s</p>
            <SweepChart rows={rows} keys={keysOf(rows)} xLabel={sweepName(k, lang)} />
            <SweepTable rows={rows} keys={keysOf(rows)} />
            <p className="small muted">{p("Sell-out probability of the recommended policy:", "Probabilidad de agotar de la política recomendada:")}{" "}
              {rows.map((r) => `${r.value}: ${pct(r.policies[r.recommended]?.sellout ?? 0, lang)}`).join(" · ")}</p>
          </div>
        ))}
      </Panel>
    </>
  );
}
