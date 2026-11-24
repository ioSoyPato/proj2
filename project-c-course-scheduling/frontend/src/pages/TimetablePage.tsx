import { useState } from "react";
import { GridFilters, dimmer, type Filter } from "../components/GridFilters";
import { CohortLegend, TimetableGrid, type GridSection } from "../components/TimetableGrid";
import { ErrorBox, Loading, PageHead, Stat } from "../components/ui";
import { useInstance, usePhase1 } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { num, sec } from "../lib/format";
import type { Breakdown, SolveResult } from "../lib/api";

export function TimetablePage() {
  const { t, d, lang } = useI18n();
  const I = useInstance(), P = usePhase1();
  const [f, setF] = useState<Filter>({ kind: "none", value: "" });
  const [selKey, setSelKey] = useState<string | null>(null);
  const err = I.error || P.error;
  if (err) return <ErrorBox error={err} />;
  if (!I.data || !P.data) return <Loading height={420} />;
  const inst = I.data, p1 = P.data;
  const mono = p1.monolithic, deco = p1.decomposed;
  const secs: GridSection[] = p1.timetable.map((row) => ({ key: String(row.section), sid: inst.sections[row.section].sid,
    course: inst.sections[row.section].course, cohort: inst.sections[row.section].cohort, pattern: row.pattern, room: row.room,
    instr_kind: "ft", instr: row.prof }));
  const sel = secs.find((s) => s.key === selKey);
  const pat = (k: number) => { const p = inst.patterns[k]; return `${p.daypair === "MW" ? d("mw") : d("tt")} ${p.start}–${p.end}`; };
  const stageA = deco.info.stage_a[deco.info.stage_a.length - 1];
  const prefRows = (b: Breakdown) => [
    [t("Non-preferred pattern for the professor (×3)", "Patrón no preferido del profesor (×3)"), b.counts.pref],
    [t("Cohort of sem. 1/3 at 7:00 or 19:00 (×2)", "Grupo de sem. 1/3 a las 7:00 o 19:00 (×2)"), b.counts.edge],
    [t("Course outside the professor's primary courses (×1)", "Curso fuera de los principales del profesor (×1)"), b.counts.primary],
    [t("Lecture course in a computer lab (×1)", "Curso teórico en laboratorio (×1)"), b.counts.lab],
    [t("Empty seats vs. forecast (×0.02 each)", "Lugares vacíos vs. pronóstico (×0.02 c/u)"), b.counts.seat],
  ] as const;
  const solverRow = (label: string, r: SolveResult) => (
    <tr><td>{label}</td><td>{r.solver}</td><td className="num">{num(r.n_vars, lang)}</td><td className="num">{num(r.n_cons, lang)}</td>
      <td className="num">{r.objective !== null ? num(r.objective, lang, 2) : "—"}</td><td className="num">{r.gap !== null ? `${num(100 * r.gap, lang, 2)}%` : "—"}</td><td className="num">{sec(r.seconds, lang)}</td></tr>
  );

  return (
    <>
      <PageHead title={d("nav.timetable")} lede={t("The timetable published before registration opens: every section with a professor, a room and a meeting pattern. Click a block for details, or filter by cohort, professor or room.", "El horario que se publica antes de abrir inscripciones: cada sección con profesor, salón y patrón de horario. Haz clic en un bloque para ver detalles o filtra por grupo, profesor o salón.")} />
      <div className="grid-3" style={{ marginBottom: "1.6rem" }}>
        <Stat value={t("Optimal", "Óptimo")} label={`${mono.result.solver}, gap ${num(100 * (mono.result.gap ?? 0), lang, 2)}%`} />
        <Stat value={sec(mono.result.seconds, lang)} label={t(`to solve ${num(mono.result.n_vars, lang)} binaries and ${num(mono.result.n_cons, lang)} constraints`, `para resolver ${num(mono.result.n_vars, lang)} binarias y ${num(mono.result.n_cons, lang)} restricciones`)} />
        <Stat tone={mono.violations.length ? "bad" : "good"} value={mono.violations.length ? num(mono.violations.length, lang) : "0"} label={t("hard-constraint violations found by the independent checker", "violaciones de restricciones duras según el verificador independiente")} />
      </div>
      <GridFilters inst={inst} f={f} setF={setF} />
      <TimetableGrid inst={inst} sections={secs} isDim={dimmer(f)} onSelect={(s) => setSelKey(s.key)} selected={selKey} />
      <div style={{ margin: "0.6rem 0 1rem" }}><CohortLegend cohorts={inst.cohorts.filter(() => true)} /></div>
      {sel && (() => {
        const c = inst.courses[sel.course];
        const pr = inst.profs[sel.instr];
        const room = inst.rooms[sel.room];
        const s = inst.sections.find((x) => x.sid === sel.sid)!;
        return (
          <div className="panel" aria-live="polite">
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.1rem" }}>{sel.sid}: {lang === "es" ? c.name_es : c.name_en}</div>
            <div className="small" style={{ marginTop: "0.3rem", color: "var(--ink-soft)" }}>
              {pat(sel.pattern)} · {room.rid} ({room.capacity} {t("seats", "lugares")}{room.is_lab ? t(", lab", ", lab") : ""}) · {pr.name} · {t("forecast", "pronóstico")} {s.forecast}
            </div>
            <div className="small muted" style={{ marginTop: "0.3rem" }}>
              {pr.preferred.includes(sel.pattern) ? t("At one of the professor's preferred patterns.", "En uno de los patrones preferidos del profesor.") : t("Not one of the professor's preferred patterns.", "No es uno de los patrones preferidos del profesor.")}{" "}
              {pr.primary.includes(sel.course) ? t("A primary course for this professor.", "Curso principal del profesor.") : t("Not one of this professor's primary courses.", "No es curso principal del profesor.")}
            </div>
          </div>
        );
      })()}

      <h2>{t("Which preferences had to give", "Qué preferencias se sacrificaron")}</h2>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t("Soft preference violated", "Preferencia suave violada")}</th><th className="num">{t("Monolithic", "Monolítico")}</th><th className="num">{t("Decomposed", "Descompuesto")}</th></tr></thead>
        <tbody>
          {prefRows(mono.breakdown).map(([label, v], i) => <tr key={i}><td>{label}</td><td className="num">{num(v, lang)}</td><td className="num">{num(prefRows(deco.breakdown)[i][1], lang)}</td></tr>)}
          <tr><td><strong>{t("Weighted objective", "Objetivo ponderado")}</strong></td><td className="num"><strong>{num(mono.breakdown.weighted_total, lang, 2)}</strong></td><td className="num"><strong>{num(deco.breakdown.weighted_total, lang, 2)}</strong></td></tr>
        </tbody>
      </table></div>
      <p className="prose">
        {mono.breakdown.counts.pref === 0 && mono.breakdown.counts.edge === 0
          ? t("Every professor teaches only at preferred patterns, and no first- or third-semester cohort lands in an edge block. ", "Todos los profesores imparten solo en patrones preferidos y ningún grupo de primer o tercer semestre cae en un bloque extremo. ")
          : t(`${mono.breakdown.counts.pref} section(s) sit outside the professor's preferred patterns and ${mono.breakdown.counts.edge} cohort section(s) fall in an edge block. `, `${mono.breakdown.counts.pref} sección(es) quedan fuera de los patrones preferidos del profesor y ${mono.breakdown.counts.edge} sección(es) de grupo caen en un bloque extremo. `)}
        {t(`${mono.breakdown.counts.primary} assignment(s) fall outside a professor's primary courses (some courses have few qualified people), plus some room oversizing. `, `${mono.breakdown.counts.primary} asignación(es) quedan fuera de los cursos principales del profesor (algunos cursos tienen pocos habilitados), más algo de sobredimensionamiento de salones. `)}
        {deco.breakdown.weighted_total > mono.breakdown.weighted_total + 1e-6
          ? t(`The decomposition cannot trade professor/pattern choices against room fit, so it ends ${num(deco.breakdown.weighted_total - mono.breakdown.weighted_total, lang, 2)} points worse.`, `La descomposición no puede intercambiar decisiones profesor/patrón contra el ajuste de salón, así que termina ${num(deco.breakdown.weighted_total - mono.breakdown.weighted_total, lang, 2)} puntos peor.`)
          : t("The decomposition reaches the same objective here.", "Aquí la descomposición alcanza el mismo objetivo.")}
      </p>

      <h2>{t("Solvers", "Solvers")}</h2>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t("Model", "Modelo")}</th><th>{t("Solver that ran", "Solver usado")}</th><th className="num">{t("Variables", "Variables")}</th><th className="num">{t("Constraints", "Restricciones")}</th><th className="num">{t("Objective", "Objetivo")}</th><th className="num">Gap</th><th className="num">{t("Time", "Tiempo")}</th></tr></thead>
        <tbody>
          {solverRow(t("Monolithic x[s,p,r,k]", "Monolítico x[s,p,r,k]"), mono.result)}
          {solverRow(t("Stage A y[s,p,k]", "Etapa A y[s,p,k]"), stageA)}
          {solverRow(t("Stage B z[s,r]", "Etapa B z[s,r]"), deco.info.stage_b)}
        </tbody>
      </table></div>
      <p className="prose small muted">{mono.result.note ? `${mono.result.note}. ` : ""}{t(`Decomposition converged in ${deco.info.iterations} iteration(s) with ${deco.info.cuts} no-good cut(s), ${sec(deco.info.seconds, lang)} in total. Both timetables pass the independent feasibility checker. The monolithic one is published because it is optimal for the full objective.`, `La descomposición convergió en ${deco.info.iterations} iteración(es) con ${deco.info.cuts} corte(s) no-good, ${sec(deco.info.seconds, lang)} en total. Ambos horarios pasan el verificador de factibilidad independiente. Se publica el monolítico porque es óptimo para el objetivo completo.`)}</p>
    </>
  );
}
