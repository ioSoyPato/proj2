import { useState } from "react";
import { FrontierChart } from "../components/PolicyCharts";
import { ErrorBox, Field, Loading, PageHead, PolicyName_ } from "../components/ui";
import { api, type Inputs, type LiveEval } from "../lib/api";
import { useInstance, useResults } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { money, num, pct } from "../lib/format";
import { StatsTable } from "./ResultsPage";
import { EpisodeView, useEpisodes } from "./WeeksPage";

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <span style={{ minWidth: "5.5rem", textAlign: "right", fontWeight: 600 }}>{fmt(value)}</span>
      </div>
    </Field>
  );
}

function Replay({ inputs }: { inputs: Inputs }) {
  const { eps, error } = useEpisodes(9_000_000, inputs);
  const I = useInstance();
  const R = useResults();
  const [p] = useState(R.data?.best ?? "dla");
  if (error) return <ErrorBox error={error} />;
  if (!I.data) return <Loading />;
  return <EpisodeView inst={I.data} eps={eps} shown={p} />;
}

export function LabPage() {
  const { t, d, lang } = useI18n();
  const R = useResults();
  const base = R.data?.meta.settings;
  const tuned = Object.fromEntries((R.data?.policies ?? []).map((p) => [p.name, p.params]));
  const [v, setV] = useState({
    penalty_unserved: 1200, penalty_change: 200, demand_multiplier: 1.0, demand_volatility: 0.2,
    unavailability_prob: 0.01, budget: 20000, N: 0, M: 16, theta: 0.9, n: 40,
  });
  const [touchedTuned, setTouchedTuned] = useState(false);
  const cur = touchedTuned ? v : { ...v, N: Number(tuned.pfa?.N ?? v.N), M: Number(tuned.pfa?.M ?? v.M), theta: Number(tuned.dla?.theta ?? v.theta) };
  const [res, setRes] = useState<LiveEval | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [replayInputs, setReplayInputs] = useState<Inputs | null>(null);
  const set = (k: keyof typeof v) => (x: number) => { setV((o) => ({ ...cur, ...o, [k]: x })); if (k === "N" || k === "M" || k === "theta") setTouchedTuned(true); };

  const run = () => {
    const inputs: Inputs = { penalty_unserved: cur.penalty_unserved, penalty_change: cur.penalty_change, demand_multiplier: cur.demand_multiplier,
      demand_volatility: cur.demand_volatility, unavailability_prob: cur.unavailability_prob, budget: cur.budget, N: cur.N, M: cur.M, theta: cur.theta };
    setBusy(true); setErr(null);
    api.evaluate({ ...inputs, n_scenarios: cur.n })
      .then((r) => { setRes(r); setReplayInputs(inputs); })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(false));
  };
  const reset = () => { setV({ penalty_unserved: base?.cost.penalty_unserved ?? 1200, penalty_change: base?.cost.penalty_change ?? 200, demand_multiplier: 1, demand_volatility: base?.scen.demand_volatility ?? 0.2, unavailability_prob: base?.scen.unavailability_prob ?? 0.01, budget: base?.cost.budget ?? 20000, N: 0, M: 16, theta: 0.9, n: 40 }); setTouchedTuned(false); };

  const best = res?.policies.find((p) => p.name === res.best);
  const second = res ? [...res.policies].sort((a, b) => a.stats.total_cost.mean - b.stats.total_cost.mean)[1] : undefined;
  const gap = res && second ? res.paired_vs_best[second.name] : undefined;

  return (
    <>
      <PageHead title={d("nav.lab")} lede={t("Change the department's assumptions and re-run the four policies on fresh simulations. The precomputed results use 500 scenarios; live runs use fewer to answer in seconds, so treat small differences with care.", "Cambia los supuestos del departamento y vuelve a correr las cuatro políticas en simulaciones nuevas. Los resultados precalculados usan 500 escenarios; las corridas en vivo usan menos para responder en segundos, así que toma con cuidado las diferencias pequeñas.")} />
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="panel" style={{ display: "grid", gap: "0.9rem" }}>
          <div style={{ fontWeight: 600 }}>{t("Costs and budget", "Costos y presupuesto")}</div>
          <Slider label={t("Penalty per student without a seat", "Penalización por alumno sin lugar")} value={cur.penalty_unserved} min={0} max={4000} step={100} onChange={set("penalty_unserved")} fmt={(x) => money(x, lang)} />
          <Slider label={t("Penalty per student moved after publication", "Penalización por alumno cambiado tras publicar")} value={cur.penalty_change} min={0} max={1000} step={25} onChange={set("penalty_change")} fmt={(x) => money(x, lang)} />
          <Slider label={t("Adjustment budget (adjuncts)", "Presupuesto de ajustes (adjuntos)")} value={cur.budget} min={0} max={60000} step={1000} onChange={set("budget")} fmt={(x) => money(x, lang)} />
        </div>
        <div className="panel" style={{ display: "grid", gap: "0.9rem" }}>
          <div style={{ fontWeight: 600 }}>{t("Uncertainty", "Incertidumbre")}</div>
          <Slider label={t("Demand level (× true mean)", "Nivel de demanda (× media real)")} value={cur.demand_multiplier} min={0.6} max={1.5} step={0.05} onChange={set("demand_multiplier")} fmt={(x) => `×${x.toFixed(2)}`} />
          <Slider label={t("Demand volatility σ", "Volatilidad de la demanda σ")} value={cur.demand_volatility} min={0} max={0.6} step={0.05} onChange={set("demand_volatility")} fmt={(x) => x.toFixed(2)} />
          <Slider label={t("Weekly chance a professor drops out", "Probabilidad semanal de baja de un profesor")} value={cur.unavailability_prob} min={0} max={0.08} step={0.005} onChange={set("unavailability_prob")} fmt={(x) => pct(x, lang, 1)} />
        </div>
        <div className="panel" style={{ display: "grid", gap: "0.9rem" }}>
          <div style={{ fontWeight: 600 }}>{t("Policy parameters (defaults are the tuned values)", "Parámetros de política (por defecto, los calibrados)")}</div>
          <Slider label={t("Waitlist rule: open a section when waitlist > N", "Regla: abrir sección si la espera > N")} value={cur.N} min={0} max={30} step={1} onChange={set("N")} fmt={(x) => String(x)} />
          <Slider label={t("Waitlist rule: merge sections below M students", "Regla: fusionar secciones con menos de M alumnos")} value={cur.M} min={0} max={30} step={1} onChange={set("M")} fmt={(x) => String(x)} />
          <Slider label={t("Re-optimization: forecast scale θ", "Re-optimización: escala del pronóstico θ")} value={cur.theta} min={0.6} max={1.6} step={0.05} onChange={set("theta")} fmt={(x) => x.toFixed(2)} />
        </div>
        <div className="panel" style={{ display: "grid", gap: "0.9rem", alignContent: "start" }}>
          <Slider label={t("Scenarios to simulate", "Escenarios a simular")} value={cur.n} min={10} max={200} step={10} onChange={set("n")} fmt={(x) => String(x)} />
          <p className="small muted" style={{ margin: 0 }}>{t(`About ${Math.max(2, Math.round(cur.n * 0.12))} s. The Q-table is not retrained: it was learned under the base assumptions.`, `Unos ${Math.max(2, Math.round(cur.n * 0.12))} s. La tabla Q no se re-entrena: se aprendió con los supuestos base.`)}</p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button className="btn" onClick={run} disabled={busy}>{busy ? t("Simulating…", "Simulando…") : t("Compare policies", "Comparar políticas")}</button>
            <button className="btn ghost" onClick={reset} disabled={busy}>{t("Reset to base", "Volver a la base")}</button>
          </div>
        </div>
      </div>

      {err && <div style={{ marginTop: "1rem" }}><ErrorBox error={err} /></div>}
      {busy && <Loading height={260} label={t(`Simulating ${cur.n} registration periods for each policy…`, `Simulando ${cur.n} periodos de inscripción por política…`)} />}
      {res && best && !busy && (
        <>
          <section className="panel" style={{ marginTop: "1.6rem", borderLeft: "4px solid var(--mark)" }}>
            <div className="small muted">{t(`Live result · ${res.n_scenarios} scenarios · ${num(res.seconds, lang, 1)} s`, `Resultado en vivo · ${res.n_scenarios} escenarios · ${num(res.seconds, lang, 1)} s`)}</div>
            <p style={{ fontSize: "1.15rem", margin: "0.4rem 0 0" }}>
              {t("Under these assumptions, use the ", "Con estos supuestos, usa la ")}<strong><PolicyName_ p={res.best} /></strong>
              {t(`: expected semester cost ${money(best.stats.total_cost.mean, lang)} with ${num(best.stats.unserved.mean, lang, 1)} students without a seat.`, `: costo esperado del semestre ${money(best.stats.total_cost.mean, lang)} con ${num(best.stats.unserved.mean, lang, 1)} alumnos sin lugar.`)}
            </p>
            {second && gap && <p className="small" style={{ margin: "0.4rem 0 0", color: "var(--ink-soft)" }}>
              {gap.ci_lo > 0
                ? t(`It beats the ${d(`policy.${second.name}` as never)} by ${money(gap.mean, lang)} per semester (paired 95% CI ${money(gap.ci_lo, lang)} to ${money(gap.ci_hi, lang)}).`, `Supera a la ${d(`policy.${second.name}` as never)} por ${money(gap.mean, lang)} por semestre (IC 95% pareado ${money(gap.ci_lo, lang)} a ${money(gap.ci_hi, lang)}).`)
                : t(`The ${d(`policy.${second.name}` as never)} is within noise (difference ${money(gap.mean, lang)}, paired 95% CI ${money(gap.ci_lo, lang)} to ${money(gap.ci_hi, lang)}). Run more scenarios to separate them.`, `La ${d(`policy.${second.name}` as never)} está dentro del ruido (diferencia ${money(gap.mean, lang)}, IC 95% pareado ${money(gap.ci_lo, lang)} a ${money(gap.ci_hi, lang)}). Corre más escenarios para separarlas.`)}
            </p>}
          </section>
          <h2>{d("m.total_cost")}</h2>
          <StatsTable policies={res.policies} best={res.best} metric="total_cost" fmt={(x) => money(x, lang)} />
          <h2>{d("m.unserved")}</h2>
          <StatsTable policies={res.policies} best={res.best} metric="unserved" fmt={(x) => num(x, lang, 1)} />
          <h2>{t("Cost against students without a seat", "Costo contra estudiantes sin lugar")}</h2>
          <FrontierChart policies={res.policies.filter((p) => p.name !== "baseline")} scenarios={res.scenarios} height={340} />
          {replayInputs && (
            <>
              <h2>{t("One scenario with these inputs, week by week", "Un escenario con estos supuestos, semana a semana")}</h2>
              <Replay inputs={replayInputs} key={JSON.stringify(replayInputs)} />
            </>
          )}
        </>
      )}
    </>
  );
}
