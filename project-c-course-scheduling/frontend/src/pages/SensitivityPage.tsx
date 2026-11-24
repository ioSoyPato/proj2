import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, axis, grid, tooltipStyle } from "../components/charts";
import type { PageKey } from "../components/Nav";
import { ErrorBox, Loading, PageHead, PolicyName_ } from "../components/ui";
import { POLICIES, type SensEntry } from "../lib/api";
import { useResults } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { kmoney, money, num } from "../lib/format";

export function SensitivityPage({ go }: { go: (k: PageKey) => void }) {
  const { t, d, lang } = useI18n();
  const { data: r, error } = useResults();
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Loading height={400} />;

  const FACT: Record<string, { name: string; fmt: (v: number) => string; unit: string }> = {
    penalty_unserved: { name: t("Penalty per student without a seat", "Penalización por alumno sin lugar"), fmt: (v) => money(v, lang), unit: "$" },
    demand_multiplier: { name: t("Demand level (× true mean)", "Nivel de demanda (× media real)"), fmt: (v) => `×${v}`, unit: "" },
    demand_volatility: { name: t("Demand volatility σ", "Volatilidad de la demanda σ"), fmt: (v) => String(v), unit: "" },
    unavailability_prob: { name: t("Weekly chance a professor drops out", "Probabilidad semanal de que un profesor se vaya"), fmt: (v) => `${(v * 100).toFixed(0)}%`, unit: "" },
    budget: { name: t("Adjustment budget", "Presupuesto de ajustes"), fmt: (v) => money(v, lang), unit: "$" },
  };
  const factors = [...new Set(r.sensitivity.map((s) => s.factor))];
  const best = r.policies.find((p) => p.name === r.best)!;
  const rl = r.policies.find((p) => p.name === "rl")!;
  const pv = r.paired_vs_best;
  const flips = r.sensitivity.filter((s) => s.best !== r.best && !s.is_base);
  const sig = (s: SensEntry) => s.significant;

  return (
    <>
      <PageHead title={d("nav.sensitivity")} lede={t("Which policy the department head should use, why, and the conditions under which the answer changes.", "Qué política debería usar el jefe de departamento, por qué, y bajo qué condiciones cambia la respuesta.")} />

      <section className="panel" style={{ borderLeft: "4px solid var(--mark)" }}>
        <div className="small muted">{t("Recommended under the base assumptions", "Recomendada con los supuestos base")}</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem", fontWeight: 750, margin: "0.2rem 0 0.6rem" }}><PolicyName_ p={r.best} /></div>
        <ul className="prose" style={{ margin: 0, paddingLeft: "1.2rem" }}>
          <li>{t(`Lowest mean semester cost on ${num(r.meta.n_eval, lang)} evaluation scenarios: ${money(best.stats.total_cost.mean, lang)} (95% CI ${money(best.stats.total_cost.ci_lo, lang)}–${money(best.stats.total_cost.ci_hi, lang)}).`, `Menor costo medio del semestre en ${num(r.meta.n_eval, lang)} escenarios de evaluación: ${money(best.stats.total_cost.mean, lang)} (IC 95% ${money(best.stats.total_cost.ci_lo, lang)}–${money(best.stats.total_cost.ci_hi, lang)}).`)}</li>
          {Object.entries(pv).filter(([n]) => n !== "baseline").map(([n, s]) => (
            <li key={n}>{t(`Versus ${d(`policy.${n}` as never)}: ${money(s.mean, lang)} cheaper per semester on average (paired CI ${money(s.ci_lo, lang)} to ${money(s.ci_hi, lang)})${s.ci_lo > 0 ? "" : ", not statistically distinguishable"}.`, `Frente a ${d(`policy.${n}` as never)}: ${money(s.mean, lang)} más barata por semestre en promedio (IC pareado ${money(s.ci_lo, lang)} a ${money(s.ci_hi, lang)})${s.ci_lo > 0 ? "" : ", sin diferencia estadísticamente distinguible"}.`)}</li>
          ))}
          <li>{t(`It halves the semester cost of doing nothing (${money(pv.baseline.mean, lang)} saved on average), and each weekly solve takes ${num(r.dla_solve.mean_seconds * 1000, lang, 0)} ms on average, so it is practical to run every Monday.`, `Reduce a la mitad el costo de no hacer nada (${money(pv.baseline.mean, lang)} de ahorro promedio), y cada resolución semanal tarda en promedio ${num(r.dla_solve.mean_seconds * 1000, lang, 0)} ms, así que es práctico correrla cada lunes.`)}</li>
          {rl && r.best !== "rl" && <li>{t(`It moves fewer students between sections after publication than the learned Q-table (${num(best.stats.changed.mean, lang, 1)} vs. ${num(rl.stats.changed.mean, lang, 1)} per semester), and it needs no retraining when costs or rules change, because it re-solves a model built from the current inputs.`, `Mueve menos alumnos de sección tras publicar que la tabla Q aprendida (${num(best.stats.changed.mean, lang, 1)} vs. ${num(rl.stats.changed.mean, lang, 1)} por semestre) y no necesita re-entrenarse cuando cambian costos o reglas, porque re-resuelve un modelo construido con los datos actuales.`)}</li>}
          <li>{t("Its decisions are explainable as a plan (open this section, hire this adjunct for week 3), which a department head can review before acting.", "Sus decisiones se explican como un plan (abrir esta sección, contratar a este adjunto para la semana 3), que el jefe de departamento puede revisar antes de actuar.")}</li>
        </ul>
      </section>

      <h2>{t("When the recommendation would change", "Cuándo cambiaría la recomendación")}</h2>
      <div className="prose">
        <p>{t(`Each factor was varied one at a time on ${r.meta.n_sens} evaluation scenarios, keeping each policy's tuned parameters fixed (the Q-table was trained only under the base assumptions). Settings where another policy has the lowest mean:`, `Cada factor se varió de uno en uno sobre ${r.meta.n_sens} escenarios de evaluación, manteniendo fijos los parámetros calibrados de cada política (la tabla Q se entrenó solo con los supuestos base). Escenarios donde otra política tiene la menor media:`)}</p>
        {(() => {
          const b = r.sensitivity.find((x) => x.is_base && x.best !== r.best);
          return b ? <p className="callout" style={{ fontSize: "0.92rem" }}>{t(`Read the base row with care: on the ${r.meta.n_sens}-scenario subset used for sensitivity, the ${d(`policy.${b.best}` as never)} is ahead of the ${d(`policy.${b.runner_up}` as never)} by ${money(b.gap_to_runner_up.mean, lang)} (paired CI ${money(b.gap_to_runner_up.ci_lo, lang)} to ${money(b.gap_to_runner_up.ci_hi, lang)}), while on all ${num(r.meta.n_eval, lang)} evaluation scenarios the ${d(`policy.${r.best}` as never)} wins. The two policies are close; the recommendation rests on the larger sample plus the practical arguments above.`, `Lee la fila base con cuidado: en el subconjunto de ${r.meta.n_sens} escenarios usado para sensibilidad, la ${d(`policy.${b.best}` as never)} supera a la ${d(`policy.${b.runner_up}` as never)} por ${money(b.gap_to_runner_up.mean, lang)} (IC pareado ${money(b.gap_to_runner_up.ci_lo, lang)} a ${money(b.gap_to_runner_up.ci_hi, lang)}), mientras que en los ${num(r.meta.n_eval, lang)} escenarios de evaluación gana la ${d(`policy.${r.best}` as never)}. Las dos políticas están cerca; la recomendación se apoya en la muestra más grande y en los argumentos prácticos de arriba.`)}</p> : null;
        })()}
        {flips.length === 0 ? <p>{t("None: the recommended policy has the lowest mean in every setting tested.", "Ninguno: la política recomendada tiene la menor media en todos los escenarios probados.")}</p> : (
          <ul>{flips.map((s, i) => (
            <li key={i}><strong>{FACT[s.factor]?.name ?? s.factor} = {FACT[s.factor]?.fmt(s.value) ?? s.value}</strong>: <PolicyName_ p={s.best} short />{" "}
              {sig(s) ? t(`wins by ${money(s.gap_to_runner_up.mean, lang)} (paired CI ${money(s.gap_to_runner_up.ci_lo, lang)} to ${money(s.gap_to_runner_up.ci_hi, lang)}).`, `gana por ${money(s.gap_to_runner_up.mean, lang)} (IC pareado ${money(s.gap_to_runner_up.ci_lo, lang)} a ${money(s.gap_to_runner_up.ci_hi, lang)}).`)
                : t(`is ahead by ${money(s.gap_to_runner_up.mean, lang)}, within noise (paired CI ${money(s.gap_to_runner_up.ci_lo, lang)} to ${money(s.gap_to_runner_up.ci_hi, lang)}).`, `va adelante por ${money(s.gap_to_runner_up.mean, lang)}, dentro del ruido (IC pareado ${money(s.gap_to_runner_up.ci_lo, lang)} a ${money(s.gap_to_runner_up.ci_hi, lang)}).`)}</li>
          ))}</ul>
        )}
        <p>{t(`In plain terms: the learned Q-table (${num(rl.stats.unserved.mean, lang, 1)} students without a seat on average, against ${num(best.stats.unserved.mean, lang, 1)}) becomes the better choice when leaving a student without a seat is priced much higher than the base ${money(r.meta.settings.cost.penalty_unserved, lang)}, because its habit of hiring adjuncts early pays off as insurance. The lookahead is significantly better when demand is well above or below forecast or more volatile, because it re-plans capacity from the updated forecast. Under every setting tested, both clearly beat the waitlist rule and the do-nothing baseline.`,
          `En términos simples: la tabla Q aprendida (${num(rl.stats.unserved.mean, lang, 1)} alumnos sin lugar en promedio, frente a ${num(best.stats.unserved.mean, lang, 1)}) se vuelve la mejor opción cuando dejar a un alumno sin lugar se valora muy por encima de los ${money(r.meta.settings.cost.penalty_unserved, lang)} base, porque su costumbre de contratar adjuntos temprano rinde como seguro. La anticipación es significativamente mejor cuando la demanda queda muy arriba o abajo del pronóstico o es más volátil, porque re-planea la capacidad con el pronóstico actualizado. En todos los escenarios probados, ambas superan claramente a la regla de lista de espera y a la política base.`)}</p>
      </div>

      <h2>{t("Sensitivity, factor by factor", "Sensibilidad, factor por factor")}</h2>
      <div className="grid-2">
        {factors.map((f) => {
          const rows = r.sensitivity.filter((s) => s.factor === f);
          const data = rows.map((s) => ({ v: s.value, ...Object.fromEntries(s.policies.map((p) => [p.name, p.mean_cost])) }));
          return (
            <div key={f}>
              <ChartFrame title={FACT[f]?.name ?? f} height={230}
                note={rows.map((s) => `${FACT[f]?.fmt(s.value)}: ${d(`policy.short.${s.best}` as never)}${s.significant ? "" : t(" (tie)", " (empate)")}`).join(" · ")}>
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 4 }}>
                    <CartesianGrid {...grid} />
                    <XAxis dataKey="v" {...axis} tickFormatter={(v) => FACT[f]?.fmt(Number(v)) ?? String(v)} />
                    <YAxis {...axis} tickFormatter={(v) => kmoney(v, lang)} width={64} domain={["auto", "auto"]} scale="log" allowDataOverflow />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => money(v, lang)} labelFormatter={(v) => FACT[f]?.fmt(Number(v)) ?? String(v)} />
                    {POLICIES.map((p) => <Line key={p} dataKey={p} name={d(`policy.short.${p}` as never)} stroke={`var(--p-${p})`} strokeWidth={p === r.best ? 2.6 : 1.6} dot={{ r: 3 }} isAnimationActive={false} />)}
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            </div>
          );
        })}
      </div>
      <p className="small muted">{t("Cost axis is logarithmic so the baseline fits on the same chart.", "El eje de costo es logarítmico para que la política base quepa en la misma gráfica.")}</p>

      <h2>{t("The four policies in plain language", "Las cuatro políticas en lenguaje simple")}</h2>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t("Policy", "Política")}</th><th>{t("What it does each week", "Qué hace cada semana")}</th><th>{t("Good at", "Bueno en")}</th><th>{t("Weak at", "Débil en")}</th></tr></thead>
        <tbody>
          <tr><td><PolicyName_ p="baseline" short /></td><td>{t("Nothing.", "Nada.")}</td><td>{t("Zero disruption for students.", "Cero cambios para los alumnos.")}</td><td>{t("Every forecast miss and every professor dropout becomes students without a seat.", "Cada error de pronóstico y cada baja de profesor se convierte en alumnos sin lugar.")}</td></tr>
          <tr><td><PolicyName_ p="pfa" short /></td><td>{t("Adds a section when a waitlist appears; merges tiny sections.", "Abre una sección cuando aparece lista de espera; fusiona secciones muy pequeñas.")}</td><td>{t("Simple, auditable, no software needed.", "Simple, auditable, sin software.")}</td><td>{t("Late: reacts after students are already waiting; ignores the adjunct lead time.", "Tardía: reacciona cuando ya hay alumnos esperando; ignora la anticipación de los adjuntos.")}</td></tr>
          <tr><td><PolicyName_ p="dla" short /></td><td>{t("Re-solves a small optimization with the updated forecast and acts on this week's part of the plan.", "Re-resuelve una optimización pequeña con el pronóstico actualizado y ejecuta la parte del plan de esta semana.")}</td><td>{t("Coordinating rooms, professors and budget; anticipating late demand.", "Coordinar salones, profesores y presupuesto; anticipar demanda tardía.")}</td><td>{t("Does not hedge against professors dropping out.", "No se cubre contra bajas de profesores.")}</td></tr>
          <tr><td><PolicyName_ p="rl" short /></td><td>{t("Looks up the best action for each course's situation in a table learned from 15,000 simulated semesters.", "Busca en una tabla aprendida de 15,000 semestres simulados la mejor acción para la situación de cada curso.")}</td><td>{t("Fewest students without a seat; most predictable cost.", "Menos alumnos sin lugar; costo más predecible.")}</td><td>{t("Moves more students between sections; must be retrained if the assumptions change.", "Mueve más alumnos entre secciones; hay que re-entrenarla si cambian los supuestos.")}</td></tr>
        </tbody>
      </table></div>
      <p className="prose"><button className="btn" onClick={() => go("lab")}>{t("Test your own assumptions", "Prueba tus propios supuestos")}</button></p>
    </>
  );
}
