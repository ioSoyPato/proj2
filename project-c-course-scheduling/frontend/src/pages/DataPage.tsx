import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceDot } from "recharts";
import { ChartFrame, axis, grid, tooltipStyle } from "../components/charts";
import { ErrorBox, Loading, PageHead } from "../components/ui";
import { shortName } from "../components/TimetableGrid";
import { useInstance } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { money, num, pct } from "../lib/format";

export function DataPage() {
  const { t, d, lang } = useI18n();
  const { data: inst, error } = useInstance();
  const [sel, setSel] = useState(0);
  if (error) return <ErrorBox error={error} />;
  if (!inst) return <Loading />;
  const c = inst.courses[sel];
  const series = [...c.history.map((h) => ({ year: h.year, enrolled: h.enrolled, forecast: null as number | null })),
    { year: 2026, enrolled: null as number | null, forecast: Math.round(c.forecast) }];
  series[series.length - 2].forecast = series[series.length - 2].enrolled;
  const mape = (k: "backtest_ape" | "naive_ape" | "mean_ape") => inst.courses.reduce((a, x) => a + x[k], 0) / inst.courses.length;
  const cname = (i: number) => (lang === "es" ? inst.courses[i].name_es : inst.courses[i].name_en);
  const patLabel = (k: number) => { const p = inst.patterns[k]; return `${p.daypair === "MW" ? d("mw") : d("tt")} ${p.start}`; };

  return (
    <>
      <PageHead title={d("nav.data")} lede={t("Everything the department knows before registration opens: courses, people, rooms, time slots and five years of enrollment history.", "Todo lo que el departamento sabe antes de abrir inscripciones: cursos, personas, salones, horarios y cinco años de historial de inscripción.")} />
      <p className="note-synthetic">{d("synthetic")} {t(`Generator seed ${inst.meta.generator_seed}; files in backend/app/data/files. Official files can be dropped in via COURSE_DATA_DIR in credentials.env.`, `Semilla del generador ${inst.meta.generator_seed}; archivos en backend/app/data/files. Los archivos oficiales pueden cargarse con COURSE_DATA_DIR en credentials.env.`)}</p>

      <h2>{t("Courses and the enrollment forecast", "Cursos y el pronóstico de inscripción")}</h2>
      <div className="prose">
        <p>{t("Room capacity in Phase 1 must cover forecast enrollment, so the forecast is part of the model. For each course we fit an ordinary least-squares line to the five annual observations and extrapolate one year with half of the slope (a damped trend, φ = 0.5): ",
          "En la Fase 1 la capacidad del salón debe cubrir la inscripción pronosticada, así que el pronóstico es parte del modelo. Para cada curso se ajusta una recta por mínimos cuadrados a las cinco observaciones anuales y se extrapola un año con la mitad de la pendiente (tendencia amortiguada, φ = 0.5): ")}
          <em>F = â + b̂·4 + 0.5·b̂</em>.{" "}
          {t("The section forecast is ⌈F / planned sections⌉. Damping protects against over-reading a noisy five-point trend.", "El pronóstico por sección es ⌈F / secciones planeadas⌉. Amortiguar evita sobre-interpretar una tendencia ruidosa de cinco puntos.")}</p>
        <p>{t(`Backtest (fit 2021–2024, predict 2025), mean absolute percentage error over the 25 courses: damped trend ${pct(mape("backtest_ape"), lang, 1)}, last-year naive ${pct(mape("naive_ape"), lang, 1)}, four-year mean ${pct(mape("mean_ape"), lang, 1)}.`,
          `Prueba retrospectiva (ajuste 2021–2024, pronóstico 2025), error porcentual absoluto medio en los 25 cursos: tendencia amortiguada ${pct(mape("backtest_ape"), lang, 1)}, ingenuo del último año ${pct(mape("naive_ape"), lang, 1)}, media de cuatro años ${pct(mape("mean_ape"), lang, 1)}.`)}</p>
      </div>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="table-wrap" style={{ maxHeight: 460, overflowY: "auto" }}>
          <table className="data">
            <thead><tr><th>{t("Course", "Curso")}</th><th className="num">{t("Sem.", "Sem.")}</th><th>{t("Lab", "Lab")}</th><th className="num">{t("Sections", "Secciones")}</th><th className="num">{t("Forecast", "Pronóstico")}</th></tr></thead>
            <tbody>
              {inst.courses.map((x) => (
                <tr key={x.idx} onClick={() => setSel(x.idx)} style={{ cursor: "pointer", background: x.idx === sel ? "var(--primary-soft)" : undefined }}>
                  <td><button type="button" onClick={() => setSel(x.idx)} style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}><strong>{x.code}</strong> {lang === "es" ? x.name_es : x.name_en}</button></td>
                  <td className="num">{x.semester}</td><td>{x.lab ? t("yes", "sí") : ""}</td>
                  <td className="num">{x.n_sections}</td><td className="num">{num(x.forecast, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.1rem" }}>{c.code} {cname(c.idx)}</div>
          <div className="small muted">{t(`Semester ${c.semester} · slope ${num(c.slope, lang, 1)} students/year · forecast ${num(c.forecast, lang, 1)} (${num(Math.ceil(c.forecast / c.n_sections), lang)} per section)`, `Semestre ${c.semester} · pendiente ${num(c.slope, lang, 1)} alumnos/año · pronóstico ${num(c.forecast, lang, 1)} (${num(Math.ceil(c.forecast / c.n_sections), lang)} por sección)`)}</div>
          <ChartFrame height={240}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="year" {...axis} />
                <YAxis {...axis} domain={["auto", "auto"]} />
                <Tooltip {...tooltipStyle} />
                <Line dataKey="enrolled" name={t("enrolled", "inscritos")} stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line dataKey="forecast" name={t("forecast", "pronóstico")} stroke="var(--mark)" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                <ReferenceDot x={2026} y={Math.round(c.forecast)} r={5} fill="var(--mark)" stroke="none" />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="small muted">{t("Qualified: ", "Habilitados: ")}{c.qualified_profs.map((p) => shortName(inst.profs[p].name)).join(", ")}{c.qualified_adjuncts.length ? t(`; adjuncts ${c.qualified_adjuncts.map((a) => inst.adjuncts[a].aid).join(", ")}`, `; adjuntos ${c.qualified_adjuncts.map((a) => inst.adjuncts[a].aid).join(", ")}`) : ""}</div>
        </div>
      </div>

      <h2>{t("Full-time professors", "Profesores de tiempo completo")}</h2>
      <p className="prose">{t(`${inst.profs.length} professors. Each section is 4 hours a week (two 2-hour sessions), so teaching loads are multiples of 4. Together they can teach at most ${inst.totals.ft_section_capacity} sections; the plan needs ${inst.sections.length}.`,
        `${inst.profs.length} profesores. Cada sección son 4 horas a la semana (dos sesiones de 2 horas), por eso las cargas son múltiplos de 4. En conjunto pueden impartir como máximo ${inst.totals.ft_section_capacity} secciones; el plan requiere ${inst.sections.length}.`)}</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>{d("professor")}</th><th>{t("Qualified courses (primary in bold)", "Cursos habilitados (principales en negritas)")}</th><th className="num">{t("Hours", "Horas")}</th><th>{t("Prefers", "Prefiere")}</th><th>{t("Unavailable", "No disponible")}</th></tr></thead>
          <tbody>
            {inst.profs.map((p) => (
              <tr key={p.idx}>
                <td style={{ whiteSpace: "nowrap" }}>{p.name}</td>
                <td>{p.qualified.map((q, i) => <span key={q}>{i ? ", " : ""}{p.primary.includes(q) ? <strong>{inst.courses[q].code}</strong> : inst.courses[q].code}</span>)}</td>
                <td className="num">{p.min_hours}–{p.max_hours}</td>
                <td className="small">{p.preferred.map(patLabel).join(", ")}</td>
                <td className="small">{p.unavailable.map(patLabel).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div>
          <h2>{t("Adjunct pool", "Bolsa de adjuntos")}</h2>
          <p className="prose small">{t("Practitioners who can be hired during registration. A hire takes two weeks to become effective, and they teach only in the evening blocks (17:00 and 19:00).", "Profesionales que pueden contratarse durante las inscripciones. La contratación tarda dos semanas en hacerse efectiva y solo imparten en los bloques vespertinos (17:00 y 19:00).")}</p>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>{t("Adjunct", "Adjunto")}</th><th className="num">{t("Per section", "Por sección")}</th><th>{t("Courses", "Cursos")}</th></tr></thead>
            <tbody>{inst.adjuncts.map((a) => (
              <tr key={a.idx}><td>{a.name}</td><td className="num">{money(a.cost_per_section, lang)}</td><td className="small">{a.qualified.map((q) => inst.courses[q].code).join(", ")}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
        <div>
          <h2>{t("Rooms", "Salones")}</h2>
          <p className="prose small">{t("Ten rooms, three of them computer labs. Lab courses must be taught in a lab.", "Diez salones, tres de ellos laboratorios de cómputo. Los cursos con laboratorio deben impartirse en uno.")}</p>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>{d("room")}</th><th className="num">{t("Seats", "Lugares")}</th><th>{t("Type", "Tipo")}</th></tr></thead>
            <tbody>{inst.rooms.map((r) => (
              <tr key={r.idx}><td>{r.rid}</td><td className="num">{r.capacity}</td><td>{r.is_lab ? t("computer lab", "laboratorio") : t("lecture room", "aula")}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
