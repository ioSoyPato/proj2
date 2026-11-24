import { useData } from "../lib/data";
import { useLang } from "../lib/i18n";
import { kMoney, num } from "../lib/format";
import { Eq } from "../components/Eq";
import { ErrorBox, Loading, Panel, PolicyName } from "../components/ui";
import { FixedCurve, LearningCurve } from "../components/charts";

export function PoliciesPage() {
  const { pre, error, reload } = useData();
  const { p, t, lang } = useLang();
  if (error) return <ErrorBox msg={error} onRetry={reload} />;
  if (!pre) return <Loading />;
  const fx = pre.policies.fixed!, pf = pre.policies.pfa!, dl = pre.policies.dla!;
  const rl = pre.policies.rl;
  const tm = pre.rl.train_meta;
  return (
    <>
      <h1>{p("Four ways to set tonight's price", "Cuatro maneras de fijar el precio")}</h1>
      <p className="lede">
        {p("One baseline and one policy from each of three of Powell's classes. Every tunable parameter is chosen on tuning seeds; the numbers on the other pages come from separate evaluation seeds.",
          "Una línea base y una política de cada una de tres clases de Powell. Todo parámetro ajustable se elige con semillas de ajuste; los números de las otras páginas vienen de semillas de evaluación separadas.")}
      </p>

      <Panel title={<PolicyName k="fixed" />} sub={t("class.baseline")}>
        <Eq>{"X^{\\text{fixed}}(S_t) = \\bar p \\quad \\forall t"}</Eq>
        <p>
          <strong>{p("Tunable:", "Ajustable:")}</strong> {p("the price p̄. ", "el precio p̄. ")}
          <strong>{p("Tuned value:", "Valor ajustado:")}</strong> ${fx.tunables.price as number}
          {p(`, the best of all ${pre.grid.length} grid prices on ${num(pre.seeds.n_tune, lang)} tuning scenarios.`, `, el mejor de los ${pre.grid.length} precios de la rejilla en ${num(pre.seeds.n_tune, lang)} escenarios de ajuste.`)}
        </p>
        <p>{p("Why: it is what most promoters do, it needs no data during the sale, and any smarter policy has to beat it to be worth the trouble.",
          "Por qué: es lo que hace la mayoría de los promotores, no necesita datos durante la venta, y cualquier política más lista debe superarla para valer la pena.")}</p>
        <FixedCurve study={pre} />
      </Panel>

      <Panel title={<PolicyName k="pfa" />} sub={t("class.PFA")}>
        <Eq>{"X^{\\text{PFA}}(S_t \\mid \\theta) = \\operatorname{round}_{\\mathcal P}\\!\\Big(P_0 + a\\,\\tfrac{t}{T-1} + k\\,\\tfrac{(C-R_t) - C\\,F_t}{C}\\Big),\\qquad F_t = \\tfrac{\\sum_{\\tau<t}\\lambda_\\tau}{\\sum_\\tau \\lambda_\\tau}"}</Eq>
        <p>
          <strong>{p("Tunable:", "Ajustables:")}</strong>{" "}
          {p("opening price P₀ ($), planned drift a ($ over the window), pace sensitivity k ($ per unit of capacity ahead of the booking curve). ",
            "precio inicial P₀ ($), deriva planeada a ($ en la ventana), sensibilidad al ritmo k ($ por unidad de capacidad adelante de la curva de reservas). ")}
          <strong>{p("Tuned:", "Ajustados:")}</strong> P₀ = ${num(pf.tunables.p0 as number, lang)}, a = ${num(pf.tunables.drift as number, lang)}, k = {num(pf.tunables.k as number, lang)}
          {p(` (coarse grid + pattern search, ${pre.pfa_tuning.evaluations} candidate rules).`, ` (rejilla gruesa + búsqueda por patrones, ${pre.pfa_tuning.evaluations} reglas candidatas).`)}
        </p>
        <p>{p("Why: it uses exactly the two state variables the assignment names — days left and seats remaining. The booking curve F_t is the sell-out-by-the-event path shaped like the arrival curve; selling ahead of it means demand is stronger than expected, so the price goes up (and vice versa). It is transparent enough to print on a card for the box office.",
          "Por qué: usa exactamente las dos variables de estado que pide el enunciado — días restantes y asientos restantes. La curva de reservas F_t es la trayectoria que agota justo al evento con la forma de la curva de llegadas; vender por encima de ella indica demanda más fuerte de lo esperado, así que el precio sube (y viceversa). Es tan transparente que cabe en una tarjeta para la taquilla.")}</p>
      </Panel>

      <Panel title={<PolicyName k="dla" />} sub={t("class.DLA")}>
        <Eq>{"\\max_{x}\\ \\sum_{b}\\sum_{j} p_j\\,\\hat D_{bj}\\,x_{bj}\\quad \\text{s.t.}\\quad \\sum_j x_{bj} = 1\\ \\forall b,\\qquad \\sum_{b}\\sum_j \\hat D_{bj}\\,x_{bj} \\le R_t,\\qquad x_{bj}\\in\\{0,1\\}"}</Eq>
        <Eq>{"\\hat D_{bj} = \\hat M_t \\sum_{\\tau \\in b} \\lambda_\\tau\\, q\\big(p_j,\\ \\hat r_\\tau(p_j)\\big),\\qquad \\hat M_t = \\frac{(C - R_t) + n_0}{\\hat E_t + n_0}"}</Eq>
        <p>{p("Each morning a multiple-choice knapsack chooses one grid price for every remaining day using expected demand, subject to the remaining seats; only today's price is posted and tomorrow it is re-solved. Approximations, all documented in the code:",
          "Cada mañana una mochila de elección múltiple elige un precio de la rejilla para cada día restante usando la demanda esperada, sujeta a los asientos restantes; solo se publica el precio de hoy y mañana se vuelve a resolver. Aproximaciones, todas documentadas en el código:")}</p>
        <ul>
          <li>{p("Reference price: the dynamics are nonlinear in the decisions, so r̂ is rolled forward along an incumbent plan; inside each block it evolves exactly under the candidate price. The MILP is re-solved up to 3 times along the new plan, keeping the iterate with the best self-consistent revenue.",
            "Precio de referencia: la dinámica es no lineal en las decisiones, así que r̂ se proyecta sobre un plan incumbente; dentro de cada bloque evoluciona exactamente con el precio candidato. El MILP se re-resuelve hasta 3 veces sobre el nuevo plan, conservando la iteración con mejor ingreso autoconsistente.")}</li>
          <li>{p(`Temporal aggregation: the next ${dl.tunables.fine_days} days are priced individually, later days in ${dl.tunables.block_len}-day blocks (≤ 17 blocks × ${pre.grid.length} prices, inside Gurobi's size-limited licence).`,
            `Agregación temporal: los próximos ${dl.tunables.fine_days} días se valúan individualmente, los siguientes en bloques de ${dl.tunables.block_len} días (≤ 17 bloques × ${pre.grid.length} precios, dentro de la licencia limitada de Gurobi).`)}</li>
          <li>{p("Demand level: a shrinkage estimate M̂ from tickets sold vs. tickets expected; n₀ is its prior strength in tickets. Scarcity boost κ ignored (conservative). Dominated grid prices are pruned exactly before solving.",
            "Nivel de demanda: un estimador con contracción M̂ a partir de boletos vendidos vs. esperados; n₀ es la fuerza de su previa en boletos. Se ignora el impulso por escasez κ (conservador). Los precios dominados se eliminan de forma exacta antes de resolver.")}</li>
        </ul>
        <p>
          <strong>{p("Tunable:", "Ajustable:")}</strong> n₀. <strong>{p("Tuned:", "Ajustado:")}</strong> n₀ = {dl.tunables.prior_n0 === null ? "∞" : num(dl.tunables.prior_n0 as number, lang)}
          {pre.dla_tuning && (<> ({pre.dla_tuning.map((r) => `${r.prior_n0 === null ? "∞" : r.prior_n0}: ${kMoney(r.mean_revenue, lang)}`).join(" · ")}; {num(pre.seeds.n_tune_dla, lang)} {p("tuning scenarios", "escenarios de ajuste")})</>)}.{" "}
          <strong>{p("Solver:", "Solver:")}</strong> {pre.solver.preferred === "gurobi" ? `Gurobi ${pre.solver.version} (${pre.solver.licence})` : `HiGHS via scipy.optimize.milp (${pre.solver.version})`}
          {pre.solver.solves && <> — {num(pre.solver.solves.gurobi ?? 0, lang)} Gurobi / {num(pre.solver.solves.highs ?? 0, lang)} HiGHS {p("solves in the final evaluation", "resoluciones en la evaluación final")}</>}; {p("relative MIP gap", "gap MIP relativo")} {dl.tunables.mip_gap}.
        </p>
        <p>{p("Why: the promoter's problem is a capacity-constrained revenue plan, which is exactly what a knapsack expresses; re-solving daily lets it react to what actually sells, and it reads the model's parameters directly, so it adapts to new inputs without retraining.",
          "Por qué: el problema del promotor es un plan de ingresos con capacidad limitada, justo lo que expresa una mochila; re-resolver a diario le permite reaccionar a lo que realmente se vende, y lee los parámetros del modelo directamente, así que se adapta a nuevas entradas sin reentrenarse.")}</p>
      </Panel>

      <Panel title={<PolicyName k="rl" />} sub={t("class.VFA")}>
        <Eq>{"X^{\\text{RL}}(S_t) = \\arg\\max_{p \\in \\mathcal P} \\bar Q_w\\big(\\phi(S_t), p\\big),\\qquad \\phi(S_t) = \\Big(\\tfrac{d_t}{T}, \\tfrac{R_t}{C}, \\tfrac{r_t}{p_{\\max}}, \\tfrac{s_{t-1}}{\\Lambda/T}, \\text{pace}_t, \\ln \\hat M_t, \\tfrac{\\lambda_t}{\\Lambda/T}\\Big)"}</Eq>
        <p>
          {p("A Double DQN (7 → 128 → 128 → 17 network) written in numpy, trained offline on its own seed family with ε-greedy exploration, a 400k-transition replay buffer, Huber loss, Adam and a Polyak-averaged target network. The checkpoint with the best greedy revenue on a separate validation family is shipped; the server never trains.",
            "Una Double DQN (red 7 → 128 → 128 → 17) escrita en numpy, entrenada fuera de línea con su propia familia de semillas, exploración ε-codiciosa, buffer de repetición de 400 mil transiciones, pérdida Huber, Adam y red objetivo con promedio de Polyak. Se distribuye el punto de control con mejor ingreso codicioso en una familia de validación separada; el servidor nunca entrena.")}
        </p>
        <p>
          <strong>{p("Tunable:", "Ajustables:")}</strong> {p("network weights w (learned), plus hyper-parameters (learning rate 3·10⁻⁴, τ = 0.005, γ = 1, ε schedule). ", "pesos de la red w (aprendidos), más hiperparámetros (tasa de aprendizaje 3·10⁻⁴, τ = 0.005, γ = 1, calendario de ε). ")}
          {tm && <>{p("Trained on", "Entrenado con")} {num(tm.episodes, lang)} {p("episodes in", "episodios en")} {num(tm.train_seconds, lang)} s; {p("best validation revenue", "mejor ingreso de validación")} {kMoney(tm.best_val_revenue, lang)}.</>}
        </p>
        <p>{p("Why: it needs no model of buyers at decision time and can, in principle, discover non-obvious pricing patterns. The price: it only knows the market it was trained on, so for other inputs it is flagged as out-of-distribution (any assumption more than 20% away) and never recommended there, or excluded if the window or grid change.",
          "Por qué: no necesita un modelo de los compradores al decidir y, en principio, puede descubrir patrones de precios no obvios. El costo: solo conoce el mercado en que se entrenó, así que para otras entradas se marca como fuera de distribución (cualquier supuesto a más de 20%) y ahí nunca se recomienda, o se excluye si cambian la ventana o la rejilla.")}</p>
        {tm?.history && <LearningCurve history={tm.history} />}
        {tm?.history && tm.history.length > 2 && (() => {
          const h = tm.history;
          const best = h.reduce((a, b) => (b.val_revenue > a.val_revenue ? b : a));
          const last = h[h.length - 1];
          if (last.val_revenue >= 0.9 * best.val_revenue) return null;
          return (
            <p className="small" style={{ color: "var(--rose)" }}>
              {p(`Training was unstable in the shipped run: validation revenue peaked at ${kMoney(best.val_revenue, lang)} after ${num(best.episodes, lang)} episodes and later collapsed to ${kMoney(last.val_revenue, lang)}. The best checkpoint is the one shipped. It was trained once, under a fixed time budget, with no further tuning.`,
                `El entrenamiento fue inestable en la corrida distribuida: el ingreso de validación tocó su máximo de ${kMoney(best.val_revenue, lang)} tras ${num(best.episodes, lang)} episodios y luego colapsó a ${kMoney(last.val_revenue, lang)}. Se distribuye el mejor punto de control. Se entrenó una sola vez, con un presupuesto de tiempo fijo, sin más ajuste.`)}
            </p>
          );
        })()}
        {!rl && <p className="small muted">{p("Not included in this run.", "No incluido en esta corrida.")}</p>}
      </Panel>
    </>
  );
}
