import { CohortLegend, TimetableGrid } from "../components/TimetableGrid";
import { ErrorBox, Loading, PolicyName_, Stat } from "../components/ui";
import type { PageKey } from "../components/Nav";
import { useInstance, usePhase1, useResults } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { money, num, pct } from "../lib/format";
import { ranking } from "../lib/recommend";

export function Overview({ go }: { go: (k: PageKey) => void }) {
  const { t, d, lang } = useI18n();
  const I = useInstance(), P = usePhase1(), R = useResults();
  const err = I.error || P.error || R.error;
  if (err) return <ErrorBox error={err} />;
  if (!I.data || !P.data || !R.data) return <Loading height={420} />;
  const inst = I.data, p1 = P.data, r = R.data;
  const order = ranking(r);
  const best = r.policies.find((p) => p.name === r.best)!;
  const base = r.policies.find((p) => p.name === "baseline")!;
  const second = r.policies.find((p) => p.name === order[1])!;
  const saving = 1 - best.stats.total_cost.mean / base.stats.total_cost.mean;
  const pv = r.paired_vs_best[second.name];
  const secs = p1.timetable.map((row) => ({ key: String(row.section), sid: inst.sections[row.section].sid, course: inst.sections[row.section].course,
    cohort: inst.sections[row.section].cohort, pattern: row.pattern, room: row.room, instr_kind: "ft", instr: row.prof }));

  return (
    <>
      <header className="hero" style={{ display: "grid", gap: "2rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))", alignItems: "start" }}>
        <div>
          <h1>{t("Build the timetable before registration. Then fix it as students arrive.", "Arma el horario antes de las inscripciones. Luego corrígelo conforme llegan los alumnos.")}</h1>
          <p className="lede">
            {t(
              `A Financial Engineering department publishes ${inst.sections.length} sections for ${inst.courses.length} courses. A mixed-integer program builds the initial timetable; then, over six weeks of registration, a policy decides each week whether to open, merge or cancel sections, hire adjuncts or move rooms. Four policies were compared on the same ${num(r.meta.n_eval, lang)} simulated registration periods.`,
              `Un departamento de Ingeniería Financiera publica ${inst.sections.length} secciones de ${inst.courses.length} cursos. Un programa entero mixto construye el horario inicial; después, durante seis semanas de inscripción, una política decide cada semana si abrir, fusionar o cancelar secciones, contratar adjuntos o cambiar de salón. Se compararon cuatro políticas sobre los mismos ${num(r.meta.n_eval, lang)} periodos de inscripción simulados.`)}
          </p>
          <p className="note-synthetic">{d("synthetic")}</p>
        </div>
        <figure style={{ margin: 0 }}>
          <TimetableGrid inst={inst} sections={secs} compact />
          <figcaption className="small muted" style={{ marginTop: "0.5rem", display: "grid", gap: "0.4rem" }}>
            <CohortLegend cohorts={inst.cohorts} />
            <span>{t(`The published Phase-1 timetable (${p1.monolithic.result.solver}, optimal in ${num(p1.monolithic.result.seconds, lang, 1)} s).`, `El horario publicado de la Fase 1 (${p1.monolithic.result.solver}, óptimo en ${num(p1.monolithic.result.seconds, lang, 1)} s).`)}</span>
          </figcaption>
        </figure>
      </header>

      <section style={{ marginTop: "2.6rem" }}>
        <div className="grid-3" style={{ gap: "1.6rem" }}>
          <Stat tone="mark" value={<PolicyName_ p={r.best} short />} label={t("lowest expected semester cost", "menor costo esperado del semestre")} />
          <Stat value={money(best.stats.total_cost.mean, lang)} label={t(`mean total cost, 95% CI ±${money(best.stats.total_cost.ci_hi - best.stats.total_cost.mean, lang)}`, `costo total medio, IC 95% ±${money(best.stats.total_cost.ci_hi - best.stats.total_cost.mean, lang)}`)} />
          <Stat tone="good" value={pct(saving, lang)} label={t("cheaper than keeping the timetable unchanged", "más barato que dejar el horario sin cambios")} />
          <Stat value={`${num(base.stats.unserved.mean, lang, 0)} → ${num(best.stats.unserved.mean, lang, 1)}`} label={t("students left without a seat per semester (baseline → recommended)", "estudiantes sin lugar por semestre (base → recomendada)")} />
        </div>
      </section>

      <h2>{t("Headline results", "Resultados principales")}</h2>
      <p className="prose">{t(
        `Each policy ran on the same ${num(r.meta.n_eval, lang)} evaluation scenarios (common random numbers), none of which was used for tuning or training. Cost is in US dollars per semester and includes instructors, rooms, adjunct fees and the penalties for students without a seat or moved after publication.`,
        `Cada política corrió sobre los mismos ${num(r.meta.n_eval, lang)} escenarios de evaluación (números aleatorios comunes), ninguno usado para calibrar o entrenar. El costo está en dólares por semestre e incluye docentes, salones, cuotas de adjuntos y las penalizaciones por estudiantes sin lugar o cambiados tras publicar.`)}</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th>{t("Policy", "Política")}</th><th>{t("Class", "Clase")}</th>
            <th className="num">{d("m.total_cost")}</th><th className="num">{d("ci95")}</th><th className="num">P5 – P95</th>
            <th className="num">{t("Without a seat", "Sin lugar")}</th><th className="num">{t("Moved", "Cambiados")}</th>
          </tr></thead>
          <tbody>
            {order.map((n) => {
              const p = r.policies.find((x) => x.name === n)!;
              const s = p.stats;
              return (
                <tr key={n} className={n === r.best ? "best" : ""}>
                  <td><PolicyName_ p={n} /></td><td><span className="tag">{p.class}</span></td>
                  <td className="num"><strong>{money(s.total_cost.mean, lang)}</strong></td>
                  <td className="num">{money(s.total_cost.ci_lo, lang)} – {money(s.total_cost.ci_hi, lang)}</td>
                  <td className="num">{money(s.total_cost.p5, lang)} – {money(s.total_cost.p95, lang)}</td>
                  <td className="num">{num(s.unserved.mean, lang, 1)}</td>
                  <td className="num">{num(s.changed.mean, lang, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="callout">
        <p style={{ margin: 0 }}>
          <strong>{t("Recommendation: ", "Recomendación: ")}</strong>
          {t(`use the ${d(`policy.${r.best}` as never)}. Against the runner-up (${d(`policy.${second.name}` as never)}) it saves ${money(pv.mean, lang)} per semester on average (paired 95% CI ${money(pv.ci_lo, lang)} to ${money(pv.ci_hi, lang)}) and is cheaper in ${pct(1 - pv.share_a_better, lang)} of scenarios.`,
             `usar la ${d(`policy.${r.best}` as never)}. Frente a la segunda (${d(`policy.${second.name}` as never)}) ahorra en promedio ${money(pv.mean, lang)} por semestre (IC 95% pareado ${money(pv.ci_lo, lang)} a ${money(pv.ci_hi, lang)}) y es más barata en ${pct(1 - pv.share_a_better, lang)} de los escenarios.`)}
          {" "}<button className="btn ghost" style={{ padding: "0.1rem 0.4rem", border: 0, textDecoration: "underline" }} onClick={() => go("sensitivity")}>{t("When would this change?", "¿Cuándo cambiaría esto?")}</button>
        </p>
      </div>

      <h2>{t("Where to go next", "A dónde ir")}</h2>
      <div className="grid-3">
        {([
          ["weeks", t("Step through one registration period week by week and see what each policy would do.", "Recorre un periodo de inscripción semana a semana y ve qué haría cada política.")],
          ["lab", t("Change the penalties, demand or budget and re-run the comparison live.", "Cambia penalizaciones, demanda o presupuesto y vuelve a correr la comparación en vivo.")],
          ["model", t("The full mathematical model in Powell's five elements.", "El modelo matemático completo en los cinco elementos de Powell.")],
        ] as const).map(([k, txt]) => (
          <button key={k} className="panel" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => go(k)}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.05rem" }}>{d(`nav.${k}` as never)}</div>
            <div className="small muted" style={{ marginTop: "0.3rem" }}>{txt}</div>
          </button>
        ))}
      </div>
    </>
  );
}
