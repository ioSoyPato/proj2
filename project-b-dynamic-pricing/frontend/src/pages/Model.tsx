import { useData } from "../lib/data";
import { useLang } from "../lib/i18n";
import { num } from "../lib/format";
import { Eq, M } from "../components/Eq";
import { Panel } from "../components/ui";
import { ArrivalCurve } from "../components/charts";

export function ModelPage() {
  const { p, lang } = useLang();
  const { meta, pre } = useData();
  const d = pre?.params ?? meta?.defaults;
  return (
    <>
      <h1>{p("The model, in Powell's five elements", "El modelo, en los cinco elementos de Powell")}</h1>
      <p className="lede">
        {p("A day is one decision epoch. Each morning the promoter sees the state, posts one price from the grid, and the day's buyers react. Index days by t = 0, …, T−1; days left before the event is d_t = T − t.",
          "Un día es una época de decisión. Cada mañana el promotor ve el estado, publica un precio de la rejilla y los compradores del día reaccionan. Los días se indexan t = 0, …, T−1; los días que faltan para el evento son d_t = T − t.")}
      </p>

      <Panel title={p("A day in the box office", "Un día en taquilla")}>
        <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
          <li>{p("Morning: observe ", "Mañana: observar ")}<M>{"S_t"}</M>{p(" (seats left, days left, reference price, yesterday's sales, sales vs. forecast).", " (asientos restantes, días restantes, precio de referencia, ventas de ayer, ventas vs. pronóstico).")}</li>
          <li>{p("Post today's price ", "Publicar el precio de hoy ")}<M>{"x_t = p_t = X^\\pi(S_t)"}</M>.</li>
          <li>{p("During the day: buyers arrive and each buys one ticket if their willingness to pay clears the effective price ", "Durante el día: llegan compradores y cada uno compra un boleto si su disposición a pagar supera el precio efectivo ")}<M>{"\\tilde p_t"}</M>.</li>
          <li>{p("Night: count sales, update seats and the reference price; move to ", "Noche: contar ventas, actualizar asientos y precio de referencia; pasar a ")}<M>{"S_{t+1}"}</M>.</li>
        </ol>
      </Panel>

      <h2>{p("1 · State variables", "1 · Variables de estado")}</h2>
      <Eq>{"S_t = \\big(R_t,\\; d_t,\\; r_t,\\; s_{t-1},\\; \\hat E_t\\big)"}</Eq>
      <dl className="defs">
        <dt><M>{"R_t"}</M></dt><dd>{p("seats remaining at the start of day t (seats); ", "asientos restantes al inicio del día t (asientos); ")}<M>{"R_0 = C"}</M>{d ? ` = ${num(d.capacity, lang)}` : ""}</dd>
        <dt><M>{"d_t"}</M></dt><dd>{p("days left before the event (days); ", "días que faltan para el evento (días); ")}<M>{"d_0 = T"}</M>{d ? ` = ${d.horizon}` : ""}</dd>
        <dt><M>{"r_t"}</M></dt><dd>{p("reference price buyers carry in their heads ($); ", "precio de referencia que los compradores tienen en mente ($); ")}<M>{"r_0"}</M>{d ? ` = $${d.ref_init}` : ""}</dd>
        <dt><M>{"s_{t-1}"}</M></dt><dd>{p("tickets sold yesterday (tickets) — the \"recent sales\" signal", "boletos vendidos ayer (boletos) — la señal de \"ventas recientes\"")}</dd>
        <dt><M>{"\\hat E_t"}</M></dt><dd>{p("tickets the model expected to sell so far at the prices actually posted, if demand were at its forecast level (tickets). Together with ", "boletos que el modelo esperaba vender hasta hoy a los precios realmente publicados, si la demanda estuviera en su nivel pronosticado (boletos). Junto con ")}<M>{"C - R_t"}</M>{p(" it is a belief state about the unknown demand level M.", " es un estado de creencia sobre el nivel de demanda desconocido M.")}</dd>
      </dl>

      <h2>{p("2 · Decision variable", "2 · Variable de decisión")}</h2>
      <Eq>{"x_t = p_t \\in \\mathcal P = \\{p_{\\min},\\, p_{\\min}+\\Delta,\\, \\dots,\\, p_{\\max}\\}"}</Eq>
      <p>
        {p(`Today's posted price ($), one per day${d ? `, from $${d.price_min} to $${d.price_max} in $${d.price_step} steps (${Math.round((d.price_max - d.price_min) / d.price_step) + 1} options)` : ""}. `,
          `El precio publicado hoy ($), uno por día${d ? `, de $${d.price_min} a $${d.price_max} en pasos de $${d.price_step} (${Math.round((d.price_max - d.price_min) / d.price_step) + 1} opciones)` : ""}. `)}
        <strong>{p("Known when deciding: ", "Conocido al decidir: ")}</strong>
        {p("only S_t, the model's structure and parameters, and the arrival curve's shape. Not known: today's arrivals, their willingness to pay, and the event's true demand level M.",
          "solo S_t, la estructura y los parámetros del modelo y la forma de la curva de llegadas. No se conoce: las llegadas de hoy, su disposición a pagar ni el nivel real de demanda M del evento.")}
      </p>

      <h2>{p("3 · Exogenous information", "3 · Información exógena")}</h2>
      <Eq>{"W_{t+1} = \\big(N_{t+1},\\; V_{t+1,1}, \\dots, V_{t+1,N_{t+1}}\\big)"}</Eq>
      <Eq>{"N_{t+1} \\sim \\text{Poisson}\\big(M\\,\\lambda_t\\, m_t\\big),\\qquad \\lambda_t = \\Lambda\\,\\frac{e^{-b(d_t-1)}}{\\sum_{\\tau} e^{-b(d_\\tau-1)}},\\qquad m_t = \\begin{cases}\\kappa & R_t < 0.1\\,C\\\\ 1 & \\text{otherwise}\\end{cases}"}</Eq>
      <Eq>{"\\ln V_{t+1,i} \\sim \\mathcal N(\\mu, \\sigma^2)\\ \\text{i.i.d.},\\qquad M \\sim \\text{LogNormal}\\!\\left(-\\tfrac{\\sigma_D^2}{2},\\, \\sigma_D\\right)\\ \\text{(drawn once, never observed)}"}</Eq>
      <dl className="defs">
        <dt><M>{"N_{t+1}"}</M></dt><dd>{p("potential buyers arriving on day t (people)", "compradores potenciales que llegan el día t (personas)")}</dd>
        <dt><M>{"V_{t+1,i}"}</M></dt><dd>{p("willingness to pay of buyer i ($); median ", "disposición a pagar del comprador i ($); mediana ")}<M>{"e^{\\mu}"}</M>{d ? ` = $${d.wtp_median}, σ = ${d.wtp_sigma}` : ""}</dd>
        <dt><M>{"\\Lambda,\\ b"}</M></dt><dd>{p("expected potential buyers over the window (people) and the arrival-curve shape (1/day); b > 0 means traffic grows as the event nears. b is the parameter calibrated on flight data.",
          "compradores potenciales esperados en la ventana (personas) y forma de la curva de llegadas (1/día); b > 0 significa que el tráfico crece al acercarse el evento. b es el parámetro calibrado con datos de vuelos.")}{d ? ` Λ = ${num(d.total_arrivals, lang)}, b = ${(d.arrival_decay ?? 0).toFixed(4)}.` : ""}</dd>
        <dt><M>{"M"}</M></dt><dd>{p("event-level demand shock (dimensionless, mean 1). An extension of the assignment's model: with σ_D = 0 it disappears and arrivals are pure Poisson. It represents not knowing in advance how popular the show is.",
          "choque de demanda a nivel del evento (adimensional, media 1). Es una extensión del modelo del enunciado: con σ_D = 0 desaparece y las llegadas son Poisson puras. Representa no saber de antemano qué tan popular es el show.")}{d ? ` σ_D = ${d.demand_sigma}.` : ""}</dd>
      </dl>
      {meta && <ArrivalCurve rates={meta.arrival_rates} />}

      <h2>{p("4 · Transition function", "4 · Función de transición")}</h2>
      <p>{p("A buyer purchases if their willingness to pay clears the reference-dependent effective price:", "Un comprador compra si su disposición a pagar supera el precio efectivo dependiente de la referencia:")}</p>
      <Eq>{"\\tilde p_t = p_t + \\eta\\,\\max(p_t - r_t, 0) - \\gamma\\,\\max(r_t - p_t, 0),\\qquad q(p_t, r_t) = \\Pr(V \\ge \\tilde p_t) = 1 - \\Phi\\!\\left(\\frac{\\ln \\tilde p_t - \\mu}{\\sigma}\\right)"}</Eq>
      <Eq>{"\\begin{aligned} y_t &= \\min\\Big(R_t,\\ \\textstyle\\sum_{i=1}^{N_{t+1}} \\mathbb 1\\{V_{t+1,i} \\ge \\tilde p_t\\}\\Big) && \\text{tickets sold}\\\\ R_{t+1} &= R_t - y_t, \\qquad d_{t+1} = d_t - 1\\\\ r_{t+1} &= \\theta\\, r_t + (1-\\theta)\\, p_t\\\\ s_t &= y_t, \\qquad \\hat E_{t+1} = \\hat E_t + \\lambda_t\\, m_t\\, q(p_t, r_t) \\end{aligned}"}</Eq>
      <p className="small muted">
        {p(`η > 0 (loss aversion), γ ≥ 0 (gain seeking), θ ∈ [0,1) (memory)${d ? `; defaults η = ${d.eta}, γ = ${d.gamma}, θ = ${d.theta}, κ = ${d.kappa}` : ""}. Unsold seats at d = 0 are worth $0.`,
          `η > 0 (aversión a la pérdida), γ ≥ 0 (búsqueda de ganancia), θ ∈ [0,1) (memoria)${d ? `; valores base η = ${d.eta}, γ = ${d.gamma}, θ = ${d.theta}, κ = ${d.kappa}` : ""}. Los asientos sin vender en d = 0 valen $0.`)}
      </p>
      <div className="callout small">
        {p("Implementation: because each buyer clears the threshold independently with probability q, the count of willing buyers is Binomial(N, q). The simulator draws N and that count by inverting their CDFs with two uniforms per scenario-day, so every policy faces exactly the same randomness (common random numbers). A test checks this against an explicit buyer-by-buyer simulation.",
          "Implementación: como cada comprador supera el umbral de forma independiente con probabilidad q, el número de compradores dispuestos es Binomial(N, q). El simulador obtiene N y ese conteo invirtiendo sus funciones de distribución con dos uniformes por escenario-día, de modo que todas las políticas enfrentan exactamente el mismo azar (números aleatorios comunes). Una prueba lo verifica contra una simulación comprador por comprador.")}
      </div>

      <h2>{p("5 · Objective function", "5 · Función objetivo")}</h2>
      <Eq>{"\\max_{\\pi \\in \\Pi}\\ \\mathbb E\\left[\\sum_{t=0}^{T-1} p_t\\, y_t \\;\\middle|\\; S_0\\right],\\qquad x_t = X^{\\pi}(S_t)"}</Eq>
      <p>
        {p("Contribution C(S_t, x_t, W_{t+1}) = p_t·y_t dollars per day; no discounting within a 60-day window. Besides the mean we report the standard deviation, the 5th/95th percentiles and a 95% confidence interval of total revenue, and the sell-out probability ",
          "Contribución C(S_t, x_t, W_{t+1}) = p_t·y_t dólares por día; sin descuento en una ventana de 60 días. Además de la media reportamos la desviación estándar, los percentiles 5/95 y un intervalo de confianza del 95% del ingreso total, y la probabilidad de agotar ")}
        <M>{"\\Pr(R_T = 0)"}</M>.
      </p>
    </>
  );
}
