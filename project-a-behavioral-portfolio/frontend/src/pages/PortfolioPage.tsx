import type { Analysis } from "../lib/api";
import { CLASS_NAMES, L, useLang, usePick } from "../lib/i18n";
import { Eq, M } from "../components/Eq";
import { Frontier } from "../components/charts";
import { PortfolioBlock } from "../components/Results";
import { Callout, Panel, Table, useFmt } from "../components/ui";

export function PortfolioPage({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const pick = usePick();
  const { pct, num } = useFmt();
  const p = a.portfolio;
  const pr = p.params;
  return (
    <div>
      <h1>{tx("Portfolio MILP", "Portafolio MILP")}</h1>
      <p className="lede">
        <L
          en={`Choose which of the ${a.data.tickers.length} ETFs to hold (binary z) and how much (weights w), maximizing expected monthly return while the expected loss in the worst 5% of historical months stays under the client's limit.`}
          es={`Elegir cuáles de los ${a.data.tickers.length} ETF mantener (binaria z) y cuánto (pesos w), maximizando el retorno mensual esperado mientras la pérdida esperada en el peor 5% de los meses históricos se mantiene bajo el límite del cliente.`}
        />
      </p>
      <h2>{tx("Formulation", "Formulación")}</h2>
      <p className="prose">
        <L
          en={<>Scenarios <M>{"s = 1..S"}</M> are the <M>{`S = ${a.data.n_months}`}</M> historical months ({a.data.start} to {a.data.end}), each with probability <M>{"1/S"}</M>; <M>{"r_s \\in \\mathbb{R}^N"}</M> is that month's return vector. The CVaR is linearized with the Rockafellar–Uryasev auxiliary variables <M>{"\\eta"}</M> (the VaR) and <M>{"\\xi_s \\ge 0"}</M> (losses beyond it).</>}
          es={<>Los escenarios <M>{"s = 1..S"}</M> son los <M>{`S = ${a.data.n_months}`}</M> meses históricos ({a.data.start} a {a.data.end}), cada uno con probabilidad <M>{"1/S"}</M>; <M>{"r_s \\in \\mathbb{R}^N"}</M> es su vector de retornos. El CVaR se linealiza con las variables auxiliares de Rockafellar–Uryasev <M>{"\\eta"}</M> (el VaR) y <M>{"\\xi_s \\ge 0"}</M> (las pérdidas más allá de él).</>}
        />
      </p>
      <Eq>{"\\begin{aligned} \\max_{w, z, \\eta, \\xi}\\quad & \\hat\\mu^{\\top} w \\\\ \\text{s.t.}\\quad & \\textstyle\\sum_i w_i = 1, \\quad w_i \\ge 0 \\\\ & \\textstyle\\sum_i z_i \\le K, \\quad z_i \\in \\{0,1\\} \\\\ & l\\, z_i \\le w_i \\le u\\, z_i \\\\ & \\textstyle\\sum_{i \\in g} w_i \\le s_{\\max} \\quad \\forall g \\\\ & \\xi_s \\ge -r_s^{\\top} w - \\eta, \\quad \\xi_s \\ge 0 \\quad \\forall s \\\\ & \\eta + \\frac{1}{(1-a)S}\\textstyle\\sum_s \\xi_s \\le C(\\lambda) \\end{aligned}"}</Eq>
      <Table
        leftCols={2}
          head={[tx("Symbol", "Símbolo"), tx("Meaning", "Significado"), tx("Value", "Valor")]}
        rows={[
          ["K", tx("max number of funds", "máximo de fondos"), `${pr.max_assets}`],
          ["l, u", tx("min / max weight of a held fund", "peso mín. / máx. de un fondo mantenido"), `${pct(pr.min_weight, 0)}, ${pct(pr.max_weight, 0)}`],
          ["s_max", tx("max weight per asset class (8 classes)", "peso máx. por clase de activo (8 clases)"), pct(pr.max_class_weight, 0)],
          ["a", tx("CVaR confidence level", "nivel de confianza del CVaR"), pct(pr.cvar_level, 0)],
          ["C(λ)", tx("monthly CVaR limit from the profile", "límite mensual de CVaR del perfil"), pct(pr.cvar_cap, 2)],
          ["μ̂", tx(`historical mean shrunk ${pct(pr.shrinkage, 0)} toward the cross-sectional average`, `media histórica encogida ${pct(pr.shrinkage, 0)} hacia el promedio de la sección cruzada`), "—"],
        ]}
      />
      <p className="prose" style={{ marginTop: "1rem" }}>
        <L
          en={<>At the optimum, the RU expression equals the exact empirical CVaR of the chosen weights: {num(p.cvar_monthly * 100, 4)}% vs {num(p.cvar_monthly_empirical * 100, 4)}% (also checked in <code>tests/test_core.py</code>). The shrinkage of <M>{"\\hat\\mu"}</M> is there because 18 years of monthly means are too noisy to be trusted asset by asset; without it the optimizer simply buys the past winners up to their caps.</>}
          es={<>En el óptimo, la expresión de RU coincide con el CVaR empírico exacto de los pesos elegidos: {num(p.cvar_monthly * 100, 4)}% vs {num(p.cvar_monthly_empirical * 100, 4)}% (también verificado en <code>tests/test_core.py</code>). El encogimiento de <M>{"\\hat\\mu"}</M> existe porque 18 años de medias mensuales son demasiado ruidosos para confiar en ellos activo por activo; sin él el optimizador simplemente compra a los ganadores pasados hasta sus topes.</>}
        />
      </p>

      <PortfolioBlock a={a} />

      <Panel title={tx("Risk–return frontier of the MILP", "Frontera riesgo–retorno del MILP")} sub={tx("Same constraints, CVaR limit swept from 2% to 10% per month.", "Mismas restricciones, límite de CVaR de 2% a 10% mensual.")}>
        <Frontier points={a.frontier} client={{ cvar: p.cvar_monthly_empirical, ret: p.expected_return_annual }} />
      </Panel>

      <h2>{tx("Solver", "Solver")}</h2>
      <p className="prose">
        <L
          en={<>The assignment asks for Gurobi. The backend has a small solver layer (<code>app/optimization/solver.py</code>): the problem is written once in matrix form and sent to Gurobi when <code>gurobipy</code> imports and its licence works (the pip package's size-limited licence is enough here: {2 * a.data.tickers.length + a.data.n_months + 1} variables), or to HiGHS through <code>scipy.optimize.milp</code> otherwise. A licence file can be supplied through <code>GRB_LICENSE_FILE</code> in <code>credentials.env</code>. Both solvers return the same optimum (tested). This run used: <strong>{a.solver}</strong>.</>}
          es={<>La tarea pide Gurobi. El backend tiene una pequeña capa de solvers (<code>app/optimization/solver.py</code>): el problema se escribe una vez en forma matricial y se envía a Gurobi cuando <code>gurobipy</code> se importa y su licencia funciona (la licencia limitada del paquete pip alcanza: {2 * a.data.tickers.length + a.data.n_months + 1} variables), o a HiGHS vía <code>scipy.optimize.milp</code> en otro caso. Se puede dar un archivo de licencia con <code>GRB_LICENSE_FILE</code> en <code>credentials.env</code>. Ambos solvers dan el mismo óptimo (probado). Esta corrida usó: <strong>{a.solver}</strong>.</>}
        />
      </p>
      <Callout tone="neutral">
        <L
          en={`In-sample caveat: the weights are chosen on the same 2008–2026 history the simulator resamples, so the static portfolio looks better in simulation than it would out of sample. The tilt to ${p.holdings.slice(0, 2).map((h) => h.ticker).join(" and ")} reflects that history. Classes held: ${p.by_class.map((c) => c.asset_class).join(", ")}.`}
          es={`Advertencia dentro de muestra: los pesos se eligen con la misma historia 2008–2026 que el simulador remuestrea, así que el portafolio estático se ve mejor en la simulación de lo que se vería fuera de muestra. La inclinación hacia ${p.holdings.slice(0, 2).map((h) => h.ticker).join(" y ")} refleja esa historia. Clases mantenidas: ${p.by_class.map((c) => pick(CLASS_NAMES[c.asset_class], c.asset_class)).join(", ")}.`}
        />
      </Callout>
    </div>
  );
}
