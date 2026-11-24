import { CartesianGrid, ErrorBar, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, axis, grid, tooltipStyle } from "../components/charts";
import { ErrorBox, Loading, PageHead, PolicyName_ } from "../components/ui";
import { useResults } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { kmoney, money, num } from "../lib/format";
import type { PolicyName } from "../lib/api";

export function PoliciesPage() {
  const { t, d, lang } = useI18n();
  const { data: r, error } = useResults();
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Loading />;
  const tu = r.tuning;
  const Ns = [...new Set(tu.pfa_grid.map((g) => g.N))].sort((a, b) => a - b);
  const Ms = [...new Set(tu.pfa_grid.map((g) => g.M))].sort((a, b) => a - b);
  const costs = tu.pfa_grid.map((g) => g.mean_cost);
  const lo = Math.min(...costs), hi = Math.max(...costs);
  const shade = (v: number) => `color-mix(in oklab, var(--primary) ${Math.round(85 - 75 * ((v - lo) / Math.max(1, hi - lo)))}%, var(--raised))`;
  const ACTIONS_ES = ["mantener", "sección con tiempo completo", "sección con adjunto", "salón más grande", "fusionar la más chica"];
  const actLabel = (a: number) => (lang === "es" ? ACTIONS_ES[a] : r.rl_actions[a]);
  const actColor = ["var(--rule-strong)", "var(--p-pfa)", "var(--p-rl)", "var(--primary)", "var(--mark)"];
  const waitL = ["0", "1–4", "5–12", "13+"];
  const gapL = ["≤ −10", "−10…−2", "−2…4", "4…12", "> 12"];

  const cards: { p: PolicyName; cls: string; params: string; how: string; why: string }[] = [
    { p: "baseline", cls: t("Baseline", "Referencia"), params: t("none", "ninguno"),
      how: t("Publish the Phase-1 timetable and never change it. Sections whose professor becomes unavailable are cancelled when classes start.", "Publicar el horario de la Fase 1 y nunca cambiarlo. Las secciones cuyo profesor queda indisponible se cancelan al iniciar clases."),
      why: t("Measures the value of adjusting at all. Every other policy has to beat it.", "Mide el valor de ajustar. Toda otra política debe superarla.") },
    { p: "pfa", cls: t("Policy function approximation (PFA)", "Aproximación de función de política (PFA)"), params: `N = ${r.policies.find((x) => x.name === "pfa")!.params.N}, M = ${r.policies.find((x) => x.name === "pfa")!.params.M}`,
      how: t("A rule a registrar could run by hand. When a course's waitlist exceeds N, add capacity: a larger free room if that absorbs it, otherwise a new section, staffed by a full-time professor with spare load or else an adjunct (hired if needed). From week 2, merge a section with fewer than M students into a sibling if they fit. Orphaned sections get a substitute or are re-timed.", "Una regla que un encargado de servicios escolares puede aplicar a mano. Cuando la lista de espera de un curso supera N, añadir capacidad: un salón libre más grande si basta, si no una sección nueva con un profesor de tiempo completo con carga libre o, si no, un adjunto (contratándolo si hace falta). Desde la semana 2, fusionar una sección con menos de M alumnos con otra si caben. Las secciones huérfanas reciben sustituto o cambian de horario."),
      why: t("Transparent and cheap to run, so it sets the bar for anything more sophisticated. It is reactive: it only sees today's waitlist, so it cannot prepare for late arrivals or the two-week adjunct lead time.", "Transparente y barata, por eso pone la vara para cualquier cosa más sofisticada. Es reactiva: solo ve la lista de espera de hoy, así que no puede prepararse para llegadas tardías ni para la anticipación de dos semanas de los adjuntos.") },
    { p: "dla", cls: t("Direct lookahead (DLA), deterministic", "Anticipación directa (DLA), determinista"), params: `θ = ${r.policies.find((x) => x.name === "dla")!.params.theta}`,
      how: t("Every week, solve a MILP over the remaining weeks using the current state and a point forecast of the requests still to come (Bayesian Gamma–Poisson update of each course's demand, scaled by θ). It plans openings, hires, merges, room moves and re-staffing week by week, then executes only this week's decisions and re-plans next week.", "Cada semana, resolver un MILP sobre las semanas restantes con el estado actual y un pronóstico puntual de las solicitudes por venir (actualización bayesiana Gamma–Poisson de la demanda de cada curso, escalada por θ). Planea aperturas, contrataciones, fusiones, cambios de salón y reasignaciones semana a semana, ejecuta solo las de esta semana y re-planea la siguiente."),
      why: t("Uses the forecast and the lead time explicitly and optimizes over the coupled resources (professors, rooms, budget) that the rule handles greedily. Its blind spot is that the lookahead is deterministic: it does not price the risk that a professor drops out.", "Usa explícitamente el pronóstico y la anticipación, y optimiza sobre los recursos acoplados (profesores, salones, presupuesto) que la regla maneja con codicia. Su punto ciego es que la anticipación es determinista: no valora el riesgo de que un profesor se vaya.") },
    { p: "rl", cls: t("Value function approximation (VFA): tabular Q-learning", "Aproximación de función de valor (VFA): Q-learning tabular"), params: t(`${num(tu.rl.episodes, lang)} training episodes, ${tu.rl.states_visited}/${tu.rl.n_states} states visited`, `${num(tu.rl.episodes, lang)} episodios de entrenamiento, ${tu.rl.states_visited}/${tu.rl.n_states} estados visitados`),
      how: t("Each course is an agent that sees five features (week, waitlist bucket, projected gap between demand and capacity, has an orphaned section, can merge) and picks one of five actions. All courses share one Q-table, learned by Monte-Carlo control with ε-greedy exploration on training scenarios that are never used for evaluation.", "Cada curso es un agente que ve cinco rasgos (semana, rango de lista de espera, brecha proyectada entre demanda y capacidad, si tiene sección huérfana, si puede fusionar) y elige una de cinco acciones. Todos los cursos comparten una tabla Q, aprendida por control Monte Carlo con exploración ε-greedy en escenarios de entrenamiento que nunca se usan para evaluar."),
      why: t("Learns from simulated experience what the deterministic lookahead cannot see, in particular that hiring adjuncts early is cheap insurance against professors dropping out. The price is a coarse state: it cannot distinguish a 30-seat elective from a 90-student core course.", "Aprende de la experiencia simulada lo que la anticipación determinista no ve, en particular que contratar adjuntos temprano es un seguro barato contra profesores que se van. El precio es un estado burdo: no distingue una optativa de 30 lugares de un curso troncal de 90 alumnos.") },
  ];

  return (
    <>
      <PageHead title={d("nav.policies")} lede={t("Four ways to make the weekly decision, from three different classes of Powell's framework plus a do-nothing baseline. Each tunable parameter was chosen on tuning scenarios that are never used in the final evaluation.", "Cuatro formas de tomar la decisión semanal, de tres clases distintas del marco de Powell más una referencia que no hace nada. Cada parámetro ajustable se eligió con escenarios de calibración que nunca se usan en la evaluación final.")} />
      <div style={{ display: "grid", gap: "1rem" }}>
        {cards.map((c) => (
          <article key={c.p} className="panel" style={{ borderLeft: `4px solid var(--p-${c.p})` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}><PolicyName_ p={c.p} /></h3>
              <span className="tag">{c.cls}</span>
            </div>
            <p className="small muted" style={{ margin: "0.3rem 0 0.6rem" }}>{t("Tuned parameters: ", "Parámetros ajustados: ")}<strong style={{ color: "var(--ink)" }}>{c.params}</strong></p>
            <p className="prose" style={{ marginBottom: "0.5rem" }}>{c.how}</p>
            <p className="prose small" style={{ margin: 0 }}><strong>{t("Why include it: ", "Por qué incluirla: ")}</strong>{c.why}</p>
          </article>
        ))}
      </div>

      <h2>{t("Tuning the waitlist rule", "Calibrando la regla de lista de espera")}</h2>
      <p className="prose">{t(`Grid search over N (waitlist trigger) and M (minimum section size) on ${r.meta.n_tune_pfa} tuning scenarios. Darker means cheaper. Best: N = ${tu.pfa_best.N}, M = ${tu.pfa_best.M} (${money(tu.pfa_best.mean_cost, lang)}). Reacting to any waitlist at all (N = 0) pays off because a seat costs far less than a lost student.`, `Búsqueda en malla sobre N (disparador de lista de espera) y M (tamaño mínimo de sección) en ${r.meta.n_tune_pfa} escenarios de calibración. Más oscuro = más barato. Mejor: N = ${tu.pfa_best.N}, M = ${tu.pfa_best.M} (${money(tu.pfa_best.mean_cost, lang)}). Reaccionar ante cualquier lista de espera (N = 0) conviene porque un lugar cuesta mucho menos que un alumno perdido.`)}</p>
      <div className="table-wrap">
        <table className="data" style={{ width: "auto" }}>
          <thead><tr><th>N \ M</th>{Ms.map((m) => <th key={m} className="num">{m}</th>)}</tr></thead>
          <tbody>{Ns.map((n) => (
            <tr key={n}><th>{n}</th>{Ms.map((m) => {
              const g = tu.pfa_grid.find((x) => x.N === n && x.M === m)!;
              const best = n === tu.pfa_best.N && m === tu.pfa_best.M;
              return <td key={m} className="num" title={`${money(g.mean_cost, lang)} · ${num(g.mean_unserved, lang, 1)}`}
                style={{ background: shade(g.mean_cost), color: (g.mean_cost - lo) / Math.max(1, hi - lo) < 0.45 ? "var(--raised)" : "var(--ink)", outline: best ? "2px solid var(--mark)" : undefined, outlineOffset: -2 }}>{kmoney(g.mean_cost, lang)}</td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>

      <div className="grid-2">
        <div>
          <h2>{t("Tuning the lookahead", "Calibrando la anticipación")}</h2>
          <p className="prose small">{t(`θ scales the forecast of remaining requests. Tested on ${r.meta.n_tune_dla} tuning scenarios; bars are 95% CIs. Best θ = ${tu.dla_best.theta}. Differences across θ are small relative to the noise.`, `θ escala el pronóstico de solicitudes restantes. Probado en ${r.meta.n_tune_dla} escenarios de calibración; las barras son IC 95%. Mejor θ = ${tu.dla_best.theta}. Las diferencias entre valores de θ son pequeñas frente al ruido.`)}</p>
          <ChartFrame height={240}>
            <ResponsiveContainer>
              <LineChart data={tu.dla_grid.map((g) => ({ ...g, err: g.ci_half }))} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="theta" {...axis} />
                <YAxis {...axis} tickFormatter={(v) => kmoney(v, lang)} domain={["auto", "auto"]} width={64} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => money(v, lang)} />
                <Line dataKey="mean_cost" name={d("m.total_cost")} stroke="var(--p-dla)" strokeWidth={2} isAnimationActive={false}>
                  <ErrorBar dataKey="err" stroke="var(--p-dla)" width={5} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
        <div>
          <h2>{t("Training the Q-table", "Entrenando la tabla Q")}</h2>
          <p className="prose small">{t(`Mean cost per block of 250 training episodes while exploring (ε decays from 0.6 to 0.05). Training took ${num(tu.rl.seconds, lang)} s.`, `Costo medio por bloque de 250 episodios de entrenamiento mientras explora (ε baja de 0.6 a 0.05). El entrenamiento tardó ${num(tu.rl.seconds, lang)} s.`)}</p>
          <ChartFrame height={240}>
            <ResponsiveContainer>
              <LineChart data={tu.rl.curve} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
                <CartesianGrid {...grid} />
                <XAxis dataKey="episode" {...axis} tickFormatter={(v) => num(v, lang)} />
                <YAxis {...axis} tickFormatter={(v) => kmoney(v, lang)} domain={["auto", "auto"]} width={64} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => money(v, lang)} labelFormatter={(v) => t(`episode ${v}`, `episodio ${v}`)} />
                <Line dataKey="mean_cost" name={d("m.total_cost")} stroke="var(--p-rl)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </div>

      <h3>{t("What the Q-table learned", "Qué aprendió la tabla Q")}</h3>
      <p className="prose small">{t("Greedy action for a course with no orphaned section and nothing to merge, by week (columns), waitlist (rows within each gap block) and projected gap between demand and capacity in seats. Empty cells were never visited in training.", "Acción codiciosa para un curso sin sección huérfana y sin nada que fusionar, por semana (columnas), lista de espera (filas dentro de cada bloque de brecha) y brecha proyectada entre demanda y capacidad en lugares. Las celdas vacías nunca se visitaron en el entrenamiento.")}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", fontSize: "0.8rem", margin: "0.4rem 0 0.8rem" }}>
        {[0, 1, 2, 3, 4].map((a) => <span key={a}><span className="dot" style={{ background: actColor[a], border: "1px solid var(--rule-strong)" }} />{actLabel(a)}</span>)}
      </div>
      <div className="table-wrap">
        <table className="data" style={{ width: "auto", fontSize: "0.78rem" }}>
          <thead><tr><th>{t("gap", "brecha")}</th><th>{t("waitlist", "espera")}</th>{[0, 1, 2, 3, 4, 5, 6].map((w) => <th key={w} className="num">{w < 6 ? `${d("week")} ${w + 1}` : t("start", "inicio")}</th>)}</tr></thead>
          <tbody>{[0, 1, 2, 3, 4].flatMap((g) => [0, 1, 2, 3].map((wb) => (
            <tr key={`${g}-${wb}`}>
              {wb === 0 && <th rowSpan={4} style={{ verticalAlign: "middle" }}>{gapL[g]}</th>}
              <td>{waitL[wb]}</td>
              {[0, 1, 2, 3, 4, 5, 6].map((w) => {
                const cell = r.rl_policy_map.find((x) => x.week === w && x.wait === wb && x.gap === g);
                const a = cell?.action;
                return <td key={w} title={a !== null && a !== undefined ? `${actLabel(a)} (${cell?.visits})` : t("not visited", "sin visitas")}
                  style={{ background: a !== null && a !== undefined ? actColor[a] : "transparent", minWidth: "2.2rem", padding: "0.25rem" }} />;
              })}
            </tr>
          )))}</tbody>
        </table>
      </div>
    </>
  );
}
