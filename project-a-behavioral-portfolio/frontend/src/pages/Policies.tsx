import type { Analysis, PolicyKey } from "../lib/api";
import { POLICY_ORDER } from "../lib/api";
import { L, POLICY_CLASS, POLICY_NAMES, useLang, usePick } from "../lib/i18n";
import { Eq, M } from "../components/Eq";
import { BandTuning, policyColor } from "../components/charts";
import { policyParams } from "../components/Results";
import { Callout, Panel, Swatch, Table, useFmt } from "../components/ui";

const RULES: Record<PolicyKey, string> = {
  buy_hold: "X^{BH}(S_t) = \\begin{cases} x^{\\star} & t = 0 \\\\ w_t & t > 0 \\end{cases}",
  pfa_band: "X^{PFA}(S_t \\mid b) = \\begin{cases} x^{\\star} & \\max_i |w_{t,i} - x^{\\star}_i| > b \\\\ w_t & \\text{otherwise} \\end{cases}",
  cfa_milp: "X^{CFA}(S_t \\mid L, \\theta) = \\arg\\max_{w} \\{ \\hat\\mu_t^{\\top} w : (w,z) \\in \\mathcal{X},\\ \\mathrm{CVaR}_{95\\%}(w;\\, \\mathcal{H}_t^{[t-L,t)}) \\le \\theta\\, C(\\lambda) \\}, \\quad t \\in \\{12, 24, \\dots\\}",
  panic: "X^{P}(S_t) = \\begin{cases} e_{c} & 1 - W_t/P^{own}_t \\ge d \\ \\text{(or still out)} \\\\ x^{\\star} & \\text{out and } V_t / \\min_{s \\in \\text{out}} V_s - 1 \\ge r \\\\ X^{PFA}(S_t) & \\text{otherwise} \\end{cases}",
  chaser: "X^{C}(S_t) = (1-k)\\,x^{\\star} + k\\,\\tfrac13 \\textstyle\\sum_{i \\in \\text{Top3}_t} e_i \\quad \\text{at } t \\equiv 0 \\ (\\mathrm{mod}\\ f), \\ \\text{band rule otherwise}",
  unassisted: "X^{U} = X^{P} \\circ X^{C} \\quad \\text{(both overlays, client's own } d, r, k, f)",
};

export function Policies({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const pick = usePick();
  const { pct, num, kmoney } = useFmt();
  const why: Record<PolicyKey, string> = {
    buy_hold: tx("The baseline every advisor should beat: no decisions after day one, no costs, weights drift with the market.", "La línea base que cualquier asesor debería superar: ninguna decisión después del día uno, sin costos, los pesos derivan con el mercado."),
    pfa_band: tx("A policy function approximation: a simple, explainable rule with one tunable parameter. Bands trade only when drift is material, which keeps costs low and gives the client a rule to follow instead of headlines.", "Una aproximación de función de política: una regla simple y explicable con un parámetro calibrable. Las bandas operan sólo cuando el desvío es material, lo que mantiene bajos los costos y le da al cliente una regla a seguir en vez de titulares."),
    cfa_milp: tx("A cost function approximation: the deterministic Part 2 MILP is re-solved on a rolling window; θ scales the risk limit to compensate for estimation error. It is the natural 'professional' policy: re-optimize once a year with what you know.", "Una aproximación de función de costo: el MILP determinista de la Parte 2 se vuelve a resolver en una ventana móvil; θ escala el límite de riesgo para compensar el error de estimación. Es la política 'profesional' natural: re-optimizar una vez al año con lo que se sabe."),
    panic: tx("Behavioral: the disciplined band policy plus a panic overlay. V is the value of the portfolio the client left, so re-entry depends on the market rebound they watch, not on their (flat) cash balance.", "Conductual: la política disciplinada de bandas más una capa de pánico. V es el valor del portafolio que el cliente dejó, así que el reingreso depende del rebote del mercado que observa, no de su saldo en efectivo (plano)."),
    chaser: tx("Behavioral: the disciplined band policy whose target is pulled toward the three ETFs with the best trailing 12-month return (T-bills excluded) at each review.", "Conductual: la política disciplinada de bandas cuyo objetivo se jala hacia los tres ETF con mejor retorno de los últimos 12 meses (sin T-bills) en cada revisión."),
    unassisted: tx("Behavioral: both overlays at once, the best guess of what this client does without an advisor.", "Conductual: ambas capas a la vez, la mejor aproximación de lo que hace este cliente sin asesor."),
  };
  return (
    <div>
      <h1>{tx("Policies", "Políticas")}</h1>
      <p className="lede">
        <L
          en="Six policies from three policy classes plus a baseline. Behavioral policies are built on top of the disciplined band rule, so with d = 100% and k = 0 they reproduce it path by path: any difference is the cost of the behavior itself."
          es="Seis políticas de tres clases más una línea base. Las conductuales se construyen sobre la regla disciplinada de bandas, así que con d = 100% y k = 0 la reproducen trayectoria por trayectoria: cualquier diferencia es el costo del comportamiento en sí."
        />
      </p>
      {POLICY_ORDER.map((k) => (
        <div key={k} style={{ borderTop: "1px solid var(--rule)", padding: "1rem 0" }}>
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <Swatch color={policyColor(k)} />
            <strong style={{ fontSize: "1.1rem" }}>{pick(POLICY_NAMES[k])}</strong>
            <span className="tag">{pick(POLICY_CLASS[a.evaluation.policies[k].class], a.evaluation.policies[k].class)}</span>
            <span className="small muted">{tx("parameters", "parámetros")}: {policyParams(a, k, tx, pct)}</span>
          </div>
          <Eq>{RULES[k]}</Eq>
          <p className="small" style={{ maxWidth: "48rem", color: "var(--ink-soft)", margin: 0 }}>{why[k]}</p>
        </div>
      ))}

      <h2>{tx("Tuning (tuning seed only)", "Calibración (sólo semilla de calibración)")}</h2>
      <p className="prose">
        <L
          en={<>Tunable parameters are chosen to maximize the mean prospect-theory value on <strong>{a.tuning.n} tuning scenarios (seed {a.tuning.seed})</strong>. The evaluation scenarios (seed {a.evaluation.seed}) are never seen during tuning, so the reported results are not inflated by selecting on noise.</>}
          es={<>Los parámetros calibrables se eligen para maximizar el valor PT medio en <strong>{a.tuning.n} escenarios de calibración (semilla {a.tuning.seed})</strong>. Los escenarios de evaluación (semilla {a.evaluation.seed}) nunca se ven durante la calibración, así que los resultados reportados no se inflan por seleccionar sobre ruido.</>}
        />
      </p>
      <Panel title={tx(`Band width b for the PFA: selected b = ${pct(a.tuning.band_selected, 0)}`, `Ancho de banda b de la PFA: b elegida = ${pct(a.tuning.band_selected, 0)}`)}
        sub={tx("Grid 0% (monthly rebalancing) to 30%. The dashed line is buy-and-hold (an infinite band).", "Rejilla de 0% (rebalanceo mensual) a 30%. La línea punteada es comprar y mantener (banda infinita).")}>
        <BandTuning a={a} />
        <p className="small" style={{ marginTop: "0.5rem" }}>
          {tx(
            "The value keeps rising with the band: in this sample, rebalancing back to the target sells the assets that went on to keep rising (equities in 2009–2026), and with the reference at the initial wealth almost no scenario ends in the loss region where rebalancing's risk control would be rewarded. The selected band sits at the edge of the grid; the policy is therefore close to buy-and-hold.",
            "El valor sigue subiendo con la banda: en esta muestra, rebalancear al objetivo vende los activos que siguieron subiendo (acciones en 2009–2026), y con la referencia en la riqueza inicial casi ningún escenario termina en la región de pérdidas donde el control de riesgo del rebalanceo sería premiado. La banda elegida está en el borde de la rejilla; la política queda por lo tanto cerca de comprar y mantener.",
          )}
        </p>
      </Panel>
      {a.tuning.cfa_grid.length > 0 && (
        <Panel title={tx(`CFA lookback L and risk multiplier θ: selected L = ${a.tuning.cfa_selected.lookback}, θ = ${a.tuning.cfa_selected.theta}`, `Ventana L y multiplicador de riesgo θ de la CFA: elegidos L = ${a.tuning.cfa_selected.lookback}, θ = ${a.tuning.cfa_selected.theta}`)}
          sub={tx("Mean PT value on the tuning scenarios; 9 combinations × 9 annual re-solves × 300 scenarios = 24,300 MILPs.", "Valor PT medio en los escenarios de calibración; 9 combinaciones × 9 re-solves anuales × 300 escenarios = 24,300 MILP.")}>
          <Table
            head={["L", "θ", tx("Mean PT value", "Valor PT medio"), tx("Median wealth", "Riqueza mediana")]}
            highlight={a.tuning.cfa_grid.findIndex((r) => r.lookback === a.tuning.cfa_selected.lookback && r.theta === a.tuning.cfa_selected.theta)}
            rows={a.tuning.cfa_grid.map((r) => [`${r.lookback} ${tx("mo", "m")}`, num(r.theta, 2), num(r.mean_pt, 4), kmoney(r.median_wealth)])}
          />
          <p className="small" style={{ marginTop: "0.5rem" }}>
            {tx("Longer windows and a looser risk limit win: short windows chase noise and trade heavily. The live endpoint reuses these tuned values (re-tuning the CFA takes about a minute).", "Ventanas más largas y un límite de riesgo más holgado ganan: las ventanas cortas persiguen ruido y operan mucho. El endpoint en vivo reutiliza estos valores calibrados (recalibrar la CFA toma cerca de un minuto).")}
          </p>
        </Panel>
      )}
      <Callout tone="neutral">
        <L
          en={<>Why no VFA or DLA: the state includes a 25-dimensional weight vector and a growing return history, so a value function would need heavy approximation, and a lookahead would need a forecasting model the data do not support. The two optimizing classes used, PFA and CFA, are the ones an advisory firm can actually explain to a client. <M>{"e_c"}</M> is the all-cash (BIL) portfolio.</>}
          es={<>Por qué no VFA ni DLA: el estado incluye un vector de pesos de 25 dimensiones y una historia de retornos creciente, así que una función de valor requeriría mucha aproximación, y una política de anticipación requeriría un modelo de pronóstico que los datos no sostienen. Las dos clases optimizadoras usadas, PFA y CFA, son las que una firma asesora puede explicarle a un cliente. <M>{"e_c"}</M> es el portafolio todo en efectivo (BIL).</>}
        />
      </Callout>
    </div>
  );
}
