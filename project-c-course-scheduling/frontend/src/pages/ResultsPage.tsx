import { CostBreakdownChart, FrontierChart, HistogramChart } from "../components/PolicyCharts";
import { ErrorBox, Loading, PageHead, PolicyName_ } from "../components/ui";
import { useResults } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { money, num, pct } from "../lib/format";
import { ranking } from "../lib/recommend";
import type { Describe, PolicyResult } from "../lib/api";

export function StatsTable({ policies, best, metric, fmt }: { policies: PolicyResult[]; best: string; metric: string; fmt: (x: number) => string }) {
  const { t, d } = useI18n();
  const order = ranking({ policies });
  return (
    <div className="table-wrap"><table className="data">
      <thead><tr><th>{t("Policy", "Política")}</th><th className="num">{d("mean")}</th><th className="num">{d("std")}</th><th className="num">P5</th><th className="num">{t("Median", "Mediana")}</th><th className="num">P95</th><th className="num">{d("ci95")}</th></tr></thead>
      <tbody>{order.map((n) => {
        const s: Describe = policies.find((p) => p.name === n)!.stats[metric];
        return (
          <tr key={n} className={n === best ? "best" : ""}>
            <td><PolicyName_ p={n} /></td><td className="num"><strong>{fmt(s.mean)}</strong></td><td className="num">{fmt(s.std)}</td>
            <td className="num">{fmt(s.p5)}</td><td className="num">{fmt(s.p50)}</td><td className="num">{fmt(s.p95)}</td>
            <td className="num">{fmt(s.ci_lo)} – {fmt(s.ci_hi)}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

export function ResultsPage() {
  const { t, d, lang } = useI18n();
  const { data: r, error } = useResults();
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Loading height={400} />;
  const m = (x: number) => money(x, lang);
  const best = r.policies.find((p) => p.name === r.best)!;
  const pfaGrid = r.tuning.pfa_grid.map((g) => ({ x: g.mean_unserved, y: g.mean_cost, label: `PFA N=${g.N}, M=${g.M} (${t("tuning", "calibración")})` }));
  const dlaGrid = r.tuning.dla_grid.map((g) => ({ x: g.mean_unserved, y: g.mean_cost, label: `DLA θ=${g.theta} (${t("tuning", "calibración")})` }));

  return (
    <>
      <PageHead title={d("nav.results")} lede={t(`Final evaluation: each policy, with its tuned parameters, on the same ${num(r.meta.n_eval, lang)} registration scenarios (evaluation seeds ${r.meta.seed_ranges.evaluation[0]}–${r.meta.seed_ranges.evaluation[1]}, disjoint from training and tuning). Because every policy faces identical students and identical professor dropouts, differences are paired.`, `Evaluación final: cada política, con sus parámetros calibrados, sobre los mismos ${num(r.meta.n_eval, lang)} escenarios de inscripción (semillas de evaluación ${r.meta.seed_ranges.evaluation[0]}–${r.meta.seed_ranges.evaluation[1]}, ajenas a entrenamiento y calibración). Como todas las políticas enfrentan los mismos alumnos y las mismas bajas de profesores, las diferencias son pareadas.`)} />

      <h2 style={{ marginTop: 0 }}>{t("Total cost per semester", "Costo total por semestre")}</h2>
      <StatsTable policies={r.policies} best={r.best} metric="total_cost" fmt={m} />
      <h2>{t("Students left without a seat", "Estudiantes sin lugar")}</h2>
      <StatsTable policies={r.policies} best={r.best} metric="unserved" fmt={(x) => num(x, lang, 1)} />
      <h2>{t("Students moved after publication", "Estudiantes cambiados tras publicar")}</h2>
      <StatsTable policies={r.policies} best={r.best} metric="changed" fmt={(x) => num(x, lang, 1)} />

      <h2>{t("Cost against students without a seat", "Costo contra estudiantes sin lugar")}</h2>
      <p className="prose">{t("Large dots are policy means on the evaluation set; faint dots are individual scenarios (first 250 per policy); hollow markers are the parameter settings tried during tuning, which trace the trade-off each family can reach. Down and to the left is better.", "Los puntos grandes son las medias por política en el conjunto de evaluación; los tenues son escenarios individuales (los primeros 250 por política); los marcadores huecos son los parámetros probados en la calibración, que trazan el intercambio que cada familia puede alcanzar. Abajo a la izquierda es mejor.")}</p>
      <FrontierChart policies={r.policies.filter((p) => p.name !== "baseline")} scenarios={r.scenarios}
        extra={[{ name: t("PFA grid", "Malla PFA"), points: pfaGrid, color: "var(--p-pfa)" }, { name: t("DLA θ grid", "Malla θ DLA"), points: dlaGrid, color: "var(--p-dla)" }]} />
      <p className="small muted">{t(`The baseline sits off the chart at ${m(r.policies.find((p) => p.name === "baseline")!.stats.total_cost.mean)} and ${num(r.policies.find((p) => p.name === "baseline")!.stats.unserved.mean, lang, 0)} students without a seat.`, `La política base queda fuera de la gráfica con ${m(r.policies.find((p) => p.name === "baseline")!.stats.total_cost.mean)} y ${num(r.policies.find((p) => p.name === "baseline")!.stats.unserved.mean, lang, 0)} estudiantes sin lugar.`)}</p>

      <div className="grid-2">
        <div>
          <h2>{t("Distribution of total cost", "Distribución del costo total")}</h2>
          <HistogramChart policies={["pfa", "dla", "rl"]} scenarios={r.scenarios} />
        </div>
        <div>
          <h2>{t("Where the money goes", "En qué se va el dinero")}</h2>
          <CostBreakdownChart policies={r.policies} />
        </div>
      </div>

      <h2>{t("Paired differences against the best policy", "Diferencias pareadas contra la mejor política")}</h2>
      <p className="prose">{t(`Mean extra cost of each policy relative to the ${d(`policy.${r.best}` as never)}, computed scenario by scenario. A confidence interval entirely above zero means the gap is not luck.`, `Costo extra medio de cada política respecto a la ${d(`policy.${r.best}` as never)}, calculado escenario por escenario. Un intervalo de confianza completamente arriba de cero significa que la diferencia no es suerte.`)}</p>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t("Policy", "Política")}</th><th className="num">{t("Extra cost (mean)", "Costo extra (media)")}</th><th className="num">{d("ci95")}</th><th className="num">{t("Scenarios where it is cheaper", "Escenarios en que es más barata")}</th><th className="num">{t("Extra students without a seat", "Estudiantes extra sin lugar")}</th></tr></thead>
        <tbody>{Object.entries(r.paired_vs_best).map(([n, s]) => (
          <tr key={n}><td><PolicyName_ p={n as never} /></td><td className="num">{m(s.mean)}</td><td className="num">{m(s.ci_lo)} – {m(s.ci_hi)}</td>
            <td className="num">{pct(s.share_a_better, lang)}</td><td className="num">{num(r.paired_unserved_vs_best[n].mean, lang, 1)} ({num(r.paired_unserved_vs_best[n].ci_lo, lang, 1)} – {num(r.paired_unserved_vs_best[n].ci_hi, lang, 1)})</td></tr>
        ))}</tbody>
      </table></div>

      <h2>{t("Reading the numbers", "Cómo leer los números")}</h2>
      <div className="prose">
        <p>{t(`Doing nothing costs about twice as much as any adaptive policy, and almost all of the difference is the penalty for students without a seat. The baseline leaves ${num(r.policies.find((p) => p.name === "baseline")!.stats.unserved.mean, lang, 0)} students unserved on average, partly because the forecast misses demand and partly because sections whose professor drops out are simply lost.`, `No hacer nada cuesta aproximadamente el doble que cualquier política adaptativa, y casi toda la diferencia es la penalización por alumnos sin lugar. La política base deja en promedio ${num(r.policies.find((p) => p.name === "baseline")!.stats.unserved.mean, lang, 0)} alumnos sin lugar, en parte porque el pronóstico se queda corto y en parte porque las secciones cuyo profesor se va simplemente se pierden.`)}</p>
        <p>{t(`Among the adaptive policies the ${d(`policy.${r.best}` as never)} has the lowest mean cost (${m(best.stats.total_cost.mean)}). The learned Q-table takes a different route: it leaves the fewest students without a seat (${num(r.policies.find((p) => p.name === "rl")!.stats.unserved.mean, lang, 1)}) and has the narrowest spread, but it moves many more students between sections (${num(r.policies.find((p) => p.name === "rl")!.stats.changed.mean, lang, 0)} vs. ${num(r.policies.find((p) => p.name === "dla")!.stats.changed.mean, lang, 0)}) and hires adjuncts as insurance. Which of the two is preferable depends on how the department prices those outcomes; see Recommendation.`, `Entre las políticas adaptativas, la ${d(`policy.${r.best}` as never)} tiene el menor costo medio (${m(best.stats.total_cost.mean)}). La tabla Q aprendida toma otro camino: deja la menor cantidad de alumnos sin lugar (${num(r.policies.find((p) => p.name === "rl")!.stats.unserved.mean, lang, 1)}) y tiene la menor dispersión, pero mueve a muchos más alumnos de sección (${num(r.policies.find((p) => p.name === "rl")!.stats.changed.mean, lang, 0)} vs. ${num(r.policies.find((p) => p.name === "dla")!.stats.changed.mean, lang, 0)}) y contrata adjuntos como seguro. Cuál de las dos conviene depende de cómo valore el departamento esos resultados; ver Recomendación.`)}</p>
      </div>
    </>
  );
}
