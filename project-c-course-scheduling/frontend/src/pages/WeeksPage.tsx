import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, axis, grid, tooltipStyle } from "../components/charts";
import { GridFilters, dimmer, type Filter } from "../components/GridFilters";
import { CohortLegend, TimetableGrid, type GridSection } from "../components/TimetableGrid";
import { ErrorBox, Loading, PageHead, PolicyName_, Seg } from "../components/ui";
import { api, POLICIES, type Episode, type Inputs, type Instance, type PolicyName, type WeekLog } from "../lib/api";
import { describeAction, describeEvent } from "../lib/actions";
import { money, num } from "../lib/format";
import { useInstance, useResults } from "../lib/hooks";
import { useI18n } from "../lib/i18n";

const SEEDS = [9_000_000, 9_000_001, 9_000_002, 9_000_007, 9_000_011];

export function useEpisodes(seed: number, inputs: Inputs) {
  const [eps, setEps] = useState<Partial<Record<PolicyName, Episode>>>({});
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify({ seed, inputs });
  useEffect(() => {
    let alive = true;
    setEps({});
    setError(null);
    for (const p of POLICIES) {
      api.episode({ policy: p, seed, ...inputs })
        .then((e) => alive && setEps((prev) => ({ ...prev, [p]: e })))
        .catch((e: Error) => alive && setError(e.message));
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { eps, error };
}

export function WeeksPage() {
  const { t, d } = useI18n();
  const I = useInstance(), R = useResults();
  const [seed, setSeed] = useState(SEEDS[0]);
  const { eps, error } = useEpisodes(seed, {});
  const [policy, setPolicy] = useState<PolicyName | null>(null);
  const shown: PolicyName = policy ?? R.data?.best ?? "dla";
  if (I.error || error) return <ErrorBox error={(I.error || error)!} />;
  if (!I.data) return <Loading height={420} />;

  return (
    <>
      <PageHead title={d("nav.weeks")} lede={t("One simulated registration period, replayed week by week. Pick a policy and move the slider: the page shows what the department head knew at the start of each week, what the policy decided, and what happened next.", "Un periodo de inscripción simulado, repetido semana a semana. Elige una política y mueve el control: la página muestra lo que el jefe de departamento sabía al inicio de cada semana, lo que decidió la política y lo que pasó después.")} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
        <Seg label={t("Policy", "Política")} value={shown} onChange={(p) => setPolicy(p)} options={POLICIES.map((p) => ({ value: p, label: d(`policy.short.${p}` as never) }))} />
        <label className="small" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>{t("Scenario", "Escenario")}
          <select className="input" value={seed} onChange={(e) => setSeed(Number(e.target.value))}>
            {SEEDS.map((s, i) => <option key={s} value={s}>{t(`Sample ${i + 1}`, `Muestra ${i + 1}`)} (seed {s})</option>)}
          </select>
        </label>
      </div>
      <EpisodeView inst={I.data} eps={eps} shown={shown} />
    </>
  );
}

export function EpisodeView({ inst, eps, shown }: { inst: Instance; eps: Partial<Record<PolicyName, Episode>>; shown: PolicyName }) {
  const { t, d, lang } = useI18n();
  const [week, setWeek] = useState(0);
  const [f, setF] = useState<Filter>({ kind: "none", value: "" });
  const [onlyTight, setOnlyTight] = useState(true);
  const ep = eps[shown];
  const series = useMemo(() => (ep ? ep.weeks.map((w) => ({
    week: w.week,
    enrolled: w.after.sections.reduce((a, s) => a + s.enrolled, 0),
    waitlist: w.after.waitlist.reduce((a, b) => a + b, 0),
    lost: w.after.lost.reduce((a, b) => a + b, 0),
  })) : []), [ep]);
  if (!ep) return <Loading height={380} label={t("Simulating the registration period…", "Simulando el periodo de inscripción…")} />;
  const w: WeekLog = ep.weeks[Math.min(week, ep.weeks.length - 1)];
  const before = w.state, after = w.after;
  const secs: GridSection[] = after.sections.map((s) => ({ key: String(s.idx), ...s }));
  const reqTotal = before.requests.reduce((a, b) => a + b, 0);
  const waitTotal = before.waitlist.reduce((a, b) => a + b, 0);
  const allSecs = [...before.sections, ...after.sections];

  // per-course fill
  const courseRows = inst.courses.map((c) => {
    const ss = after.sections.filter((s) => s.course === c.idx);
    const cap = ss.reduce((a, s) => a + (s.status === "active" ? s.capacity : 0), 0);
    const enr = ss.reduce((a, s) => a + s.enrolled, 0);
    return { c, ss, cap, enr, wait: after.waitlist[c.idx], lost: after.lost[c.idx] };
  }).filter((r) => !onlyTight || r.wait > 0 || r.enr >= 0.9 * r.cap || r.ss.some((s) => s.origin === "new" || s.instr_kind === ""))
    .sort((a, b) => (b.wait + b.enr / Math.max(1, b.cap)) - (a.wait + a.enr / Math.max(1, a.cap)));

  return (
    <>
      <div className="panel" style={{ display: "grid", gap: "0.8rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "2.2rem", fontWeight: 750, lineHeight: 1 }}>
            {w.week < 6 ? `${d("week")} ${w.week + 1}` : t("Classes start", "Inicio de clases")}
            <span className="muted" style={{ fontSize: "1rem", fontWeight: 400, marginLeft: "0.6rem" }}>{w.week < 6 ? t("of 6", "de 6") : ""}</span>
          </div>
          <div className="small muted">{t(`At the start of this week: ${num(reqTotal, lang)} requests so far, ${num(waitTotal, lang)} on waitlists, ${money(before.budget, lang)} of budget left.`, `Al inicio de esta semana: ${num(reqTotal, lang)} solicitudes, ${num(waitTotal, lang)} en listas de espera, ${money(before.budget, lang)} de presupuesto restante.`)}</div>
        </div>
        <input type="range" min={0} max={ep.weeks.length - 1} value={week} onChange={(e) => setWeek(Number(e.target.value))} aria-label={d("week")} />
        <div style={{ display: "flex", justifyContent: "space-between" }} className="small muted">
          {ep.weeks.map((x) => <span key={x.week}>{x.week < 6 ? x.week + 1 : t("start", "inicio")}</span>)}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: "1.2rem", alignItems: "start" }}>
        <section>
          <h3 style={{ marginTop: 0 }}>{t("Recommended actions this week", "Acciones recomendadas esta semana")} <span className="muted small" style={{ fontWeight: 400 }}>(<PolicyName_ p={shown} short />)</span></h3>
          {w.actions.length === 0
            ? <p className="muted">{shown === "baseline" ? t("The baseline never changes the timetable.", "La política base nunca cambia el horario.") : t("No change needed this week.", "No hace falta ningún cambio esta semana.")}</p>
            : <ol style={{ paddingLeft: "1.2rem", margin: 0, display: "grid", gap: "0.45rem" }}>
                {w.actions.map((a, i) => <li key={i} style={{ background: "var(--mark-soft)", padding: "0.35rem 0.6rem", borderRadius: 4, color: "var(--ink)" }}>{describeAction(a, inst, lang, allSecs)}</li>)}
              </ol>}
          {w.plan && typeof w.plan === "object" && "future_opens_planned" in w.plan && (
            <p className="small muted" style={{ marginTop: "0.6rem" }}>{t(`The lookahead model (${w.plan.n_vars} variables, solved in ${w.plan.seconds} s) also planned ${w.plan.future_opens_planned} opening(s) and ${w.plan.future_hires_planned} hire(s) for later weeks. Those are not executed now; they are re-planned next week with new information.`, `El modelo de anticipación (${w.plan.n_vars} variables, resuelto en ${w.plan.seconds} s) también planeó ${w.plan.future_opens_planned} apertura(s) y ${w.plan.future_hires_planned} contratación(es) para semanas posteriores. No se ejecutan ahora; se re-planean la próxima semana con nueva información.`)}</p>
          )}
          <h3>{t("What happened during the week", "Qué pasó durante la semana")}</h3>
          <ul style={{ paddingLeft: "1.2rem", margin: 0 }} className="small">
            {w.week < 6 && <li>{t(`${num(after.requests.reduce((a, b) => a + b, 0) - reqTotal, lang)} new registration requests arrived.`, `Llegaron ${num(after.requests.reduce((a, b) => a + b, 0) - reqTotal, lang)} solicitudes nuevas.`)}</li>}
            {w.week < 6 && <li>{t(`${num(after.lost.reduce((a, b) => a + b, 0) - before.lost.reduce((a, b) => a + b, 0), lang)} waitlisted students gave up.`, `${num(after.lost.reduce((a, b) => a + b, 0) - before.lost.reduce((a, b) => a + b, 0), lang)} alumnos en lista de espera se rindieron.`)}</li>}
            {w.events.map((e, i) => <li key={i} style={{ color: "var(--bad)" }}>{describeEvent(e, inst, lang)}</li>)}
          </ul>
        </section>
        <section>
          <ChartFrame title={t("Enrolled, waiting and lost students", "Alumnos inscritos, en espera y perdidos")} height={220}>
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="week" {...axis} tickFormatter={(v) => (v < 6 ? String(v + 1) : t("start", "inicio"))} />
                <YAxis yAxisId="r" orientation="right" {...axis} />
                <YAxis yAxisId="l" {...axis} />
                <Tooltip {...tooltipStyle} labelFormatter={(v) => (Number(v) < 6 ? `${d("week")} ${Number(v) + 1}` : t("Classes start", "Inicio de clases"))} />
                <Area yAxisId="l" dataKey="enrolled" name={t("enrolled", "inscritos")} stroke="var(--primary)" fill="var(--primary-soft)" isAnimationActive={false} />
                <Area yAxisId="r" dataKey="waitlist" name={t("waiting (right axis)", "en espera (eje der.)")} stroke="var(--mark)" fill="var(--mark-soft)" isAnimationActive={false} />
                <ReferenceLine yAxisId="l" x={w.week} stroke="var(--ink)" strokeDasharray="3 3" />
                <Area yAxisId="r" dataKey="lost" name={t("gave up (right axis)", "se rindieron (eje der.)")} stroke="var(--bad)" fill="transparent" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartFrame>
          <div className="small muted">{t("The dashed line marks the week selected on the slider.", "La línea punteada marca la semana elegida en el control.")}</div>
        </section>
      </div>

      <h2>{t("Timetable at the end of the week", "Horario al final de la semana")}</h2>
      <p className="small muted">{t("The strip at the bottom of each block is its fill level. Dashed outline: opened during registration. Hatched: currently without a professor.", "La franja al pie de cada bloque es su nivel de ocupación. Contorno punteado: abierta durante inscripciones. Rayado: sin profesor por ahora.")}</p>
      <GridFilters inst={inst} f={f} setF={setF} />
      <TimetableGrid inst={inst} sections={secs} isDim={dimmer(f)} />
      <div style={{ marginTop: "0.6rem" }}><CohortLegend cohorts={inst.cohorts} /></div>

      <h2>{t("Section fill levels and waitlists", "Ocupación de secciones y listas de espera")}</h2>
      <label className="small" style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <input type="checkbox" checked={onlyTight} onChange={(e) => setOnlyTight(e.target.checked)} />
        {t("Only courses that are full, have a waitlist, or changed", "Solo cursos llenos, con lista de espera o con cambios")}
      </label>
      <div style={{ display: "grid", gap: "0.7rem", marginTop: "0.8rem" }}>
        {courseRows.length === 0 && <p className="muted">{t("No course is full, waitlisted or changed at this point. Untick the box to see every course.", "Ningún curso está lleno, con lista de espera o con cambios en este punto. Desmarca la casilla para ver todos.")}</p>}
        {courseRows.map((r) => (
          <div key={r.c.idx} style={{ display: "grid", gridTemplateColumns: "minmax(9rem, 15rem) 1fr", gap: "0.8rem", alignItems: "center" }}>
            <div className="small"><strong>{r.c.code}</strong> {lang === "es" ? r.c.name_es : r.c.name_en}
              <div className="muted">{num(r.enr, lang)}/{num(r.cap, lang)} {t("seats", "lugares")}{r.wait ? t(` · ${r.wait} waiting`, ` · ${r.wait} en espera`) : ""}{r.lost ? t(` · ${r.lost} gave up`, ` · ${r.lost} se rindieron`) : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {r.ss.map((s) => (
                <div key={s.idx} style={{ flex: `${s.capacity} 1 4rem` }} title={`${s.sid}: ${s.enrolled}/${s.capacity}`}>
                  <div className="fill-bar"><span style={{ width: `${Math.min(100, (100 * s.enrolled) / s.capacity)}%`, background: s.status === "planned" ? "var(--rule-strong)" : `var(--c-${s.cohort})` }} /></div>
                  <div className="small muted" style={{ fontSize: "0.72rem" }}>{s.sid.replace(r.c.code + "-", "")} {s.enrolled}/{s.capacity}{s.status === "planned" ? t(" (opens later)", " (abre después)") : ""}{s.instr_kind === "" ? t(" · no prof.", " · sin prof.") : ""}</div>
                </div>
              ))}
              {r.wait > 0 && <span className="tag" style={{ background: "var(--mark-soft)", color: "var(--mark-ink)", alignSelf: "flex-start" }}>+{r.wait} {t("waiting", "en espera")}</span>}
            </div>
          </div>
        ))}
      </div>

      <h2>{t("The same scenario under each policy", "El mismo escenario con cada política")}</h2>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t("Policy", "Política")}</th><th className="num">{d("m.total_cost")}</th><th className="num">{t("Without a seat", "Sin lugar")}</th><th className="num">{t("Moved", "Cambiados")}</th><th className="num">{t("Sections opened", "Secciones abiertas")}</th><th className="num">{t("Adjuncts hired", "Adjuntos contratados")}</th></tr></thead>
        <tbody>{POLICIES.map((p) => {
          const e = eps[p];
          return (
            <tr key={p} className={p === shown ? "best" : ""}>
              <td><PolicyName_ p={p} /></td>
              {e ? <>
                <td className="num">{money(e.outcome.total_cost, lang)}</td><td className="num">{e.outcome.unserved}</td><td className="num">{e.outcome.changed}</td>
                <td className="num">{e.outcome.sections_opened}</td><td className="num">{e.outcome.adjuncts_hired}</td>
              </> : <td colSpan={5} className="muted small">{t("simulating…", "simulando…")}</td>}
            </tr>
          );
        })}</tbody>
      </table></div>
      <p className="small muted">{t(`Total demand in this scenario: ${num(ep.outcome.demand, lang)} course requests. One scenario is an anecdote. The Results page averages over 500.`, `Demanda total en este escenario: ${num(ep.outcome.demand, lang)} solicitudes. Un escenario es una anécdota. La página Resultados promedia sobre 500.`)}</p>
    </>
  );
}
