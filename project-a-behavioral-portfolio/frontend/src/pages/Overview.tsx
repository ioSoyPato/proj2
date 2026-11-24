import type { Analysis } from "../lib/api";
import { POLICY_ORDER } from "../lib/api";
import { L, POLICY_CLASS, POLICY_NAMES, useLang, usePick } from "../lib/i18n";
import type { PageKey } from "../components/Nav";
import { ValueFunction, policyColor } from "../components/charts";
import { Callout, Swatch, Table, useFmt } from "../components/ui";

export function Overview({ a, go }: { a: Analysis; go: (p: PageKey) => void }) {
  const { tx } = useLang();
  const pick = usePick();
  const { kmoney, signedK, num, pct } = useFmt();
  const P = a.evaluation.policies;
  const un = a.behavior_cost.unassisted;
  const optMedians = (["buy_hold", "pfa_band", "cfa_milp"] as const).map((k) => P[k].terminal_wealth.median);
  const strategySpread = Math.max(...optMedians) - Math.min(...optMedians);
  const behaviorBigger = Math.abs(un.median_wealth_diff) > strategySpread;
  const rec = a.recommendation.policy;

  return (
    <div>
      <section className="hero">
        <div>
          <h1>
            <L en="Your portfolio is only as good as the person holding it." es="Tu portafolio vale lo que vale la persona que lo sostiene." />
          </h1>
          <p className="lede">
            <L
              en="This tool measures how a client feels about gains and losses, builds a portfolio that fits that profile, and then simulates ten years of the client living with it, including the moments they are most likely to abandon it."
              es="Esta herramienta mide cómo siente un cliente las ganancias y las pérdidas, construye un portafolio acorde a ese perfil y simula diez años del cliente viviendo con él, incluidos los momentos en que es más probable que lo abandone."
            />
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button className="btn" onClick={() => go("advisor")}>{tx("Profile a client", "Perfilar a un cliente")}</button>
            <button className="btn ghost" onClick={() => go("model")}>{tx("Read the model", "Leer el modelo")}</button>
          </div>
        </div>
        <div className="hero-figure">
          <ValueFunction x={a.profile.value_curve.x} v={a.profile.value_curve.v} height={340} />
          <p className="small muted" style={{ margin: "0.2rem 0 0", textAlign: "center" }}>
            {tx(
              `The default client: losses hurt ${num(a.profile.lam, 2)} times as much as equal gains please (λ), with curvature α = ${num(a.profile.alpha, 2)}, β = ${num(a.profile.beta, 2)}.`,
              `El cliente por defecto: las pérdidas duelen ${num(a.profile.lam, 2)} veces lo que agradan ganancias iguales (λ), con curvatura α = ${num(a.profile.alpha, 2)}, β = ${num(a.profile.beta, 2)}.`,
            )}
          </p>
        </div>
      </section>

      <Callout tone="you">
        <div style={{ fontSize: "1.08rem" }}>
          {behaviorBigger
            ? tx(
                `For the default client, acting on their own instincts moves the median 10-year outcome by ${signedK(un.median_wealth_diff)}. That is larger than the ${kmoney(strategySpread)} separating the best and worst disciplined strategy.`,
                `Para el cliente por defecto, actuar según sus propios instintos mueve el resultado mediano a 10 años en ${signedK(un.median_wealth_diff)}. Es más que los ${kmoney(strategySpread)} que separan a la mejor y la peor estrategia disciplinada.`,
              )
            : tx(
                `For the default client, acting on their own instincts moves the median 10-year outcome by ${signedK(un.median_wealth_diff)}, while the disciplined strategies differ by up to ${kmoney(strategySpread)}.`,
                `Para el cliente por defecto, actuar según sus propios instintos mueve el resultado mediano a 10 años en ${signedK(un.median_wealth_diff)}, mientras que las estrategias disciplinadas difieren hasta en ${kmoney(strategySpread)}.`,
              )}
        </div>
      </Callout>

      <h2>{tx("How it works", "Cómo funciona")}</h2>
      <div className="grid3">
        {[
          { n: 1, t: tx("Profile", "Perfil"), d: tx("Ten questions estimate the prospect-theory value function (α, β, λ) and four behavioral parameters: when the client panics, when they return, how hard and how often they chase winners.", "Diez preguntas estiman la función de valor de la teoría prospectiva (α, β, λ) y cuatro parámetros de comportamiento: cuándo entra en pánico el cliente, cuándo regresa, qué tanto y qué tan seguido persigue a los ganadores."), p: "profile" as PageKey },
          { n: 2, t: tx("Portfolio", "Portafolio"), d: tx(`A mixed-integer program picks at most ${a.portfolio.params.max_assets} of ${a.data.tickers.length} ETFs and their weights, maximizing expected return under a CVaR limit that tightens as λ grows.`, `Un programa entero mixto elige a lo más ${a.portfolio.params.max_assets} de ${a.data.tickers.length} ETF y sus pesos, maximizando el retorno esperado bajo un límite de CVaR que se aprieta conforme crece λ.`), p: "portfolio" as PageKey },
          { n: 3, t: tx("Simulation", "Simulación"), d: tx(`Six policies, from disciplined rules to the client's own habits, live through the same ${a.evaluation.n} ten-year market histories built from real monthly returns.`, `Seis políticas, desde reglas disciplinadas hasta los hábitos del propio cliente, viven las mismas ${a.evaluation.n} historias de mercado de diez años construidas con retornos mensuales reales.`), p: "evaluation" as PageKey },
        ].map((s) => (
          <button key={s.n} onClick={() => go(s.p)} className="panel" style={{ textAlign: "left", cursor: "pointer", margin: 0 }}>
            <div style={{ fontSize: "2.2rem", fontWeight: 800, lineHeight: 1, color: "var(--ink-muted)" }}>{s.n}</div>
            <div style={{ fontWeight: 700, margin: "0.5rem 0 0.3rem", fontSize: "1.05rem" }}>{s.t}</div>
            <div className="small" style={{ color: "var(--ink-soft)" }}>{s.d}</div>
          </button>
        ))}
      </div>

      <h2>{tx("Headline results", "Resultados principales")}</h2>
      <p className="small muted" style={{ maxWidth: "46rem" }}>
        {tx(
          `Default profile, ${kmoney(a.settings.initial_wealth)} invested for 10 years, ${a.evaluation.n} evaluation scenarios (seed ${a.evaluation.seed}); policy parameters tuned on ${a.tuning.n} separate scenarios (seed ${a.tuning.seed}). PT value is the prospect-theory value of terminal wealth relative to the reference point, the objective every policy is judged by.`,
          `Perfil por defecto, ${kmoney(a.settings.initial_wealth)} invertidos por 10 años, ${a.evaluation.n} escenarios de evaluación (semilla ${a.evaluation.seed}); parámetros calibrados en ${a.tuning.n} escenarios distintos (semilla ${a.tuning.seed}). El valor PT es el valor de la teoría prospectiva de la riqueza final respecto al punto de referencia: el objetivo con el que se juzga a cada política.`,
        )}
      </p>
      <Table
        leftCols={2}
          head={[tx("Policy", "Política"), tx("Class", "Clase"), tx("Median wealth", "Riqueza mediana"), "P5", "P95", tx("Mean PT value [95% CI]", "Valor PT medio [IC 95%]")]}
        highlight={POLICY_ORDER.indexOf(rec)}
        rows={POLICY_ORDER.map((k) => [
          <span><Swatch color={policyColor(k)} />{pick(POLICY_NAMES[k])}</span>,
          pick(POLICY_CLASS[P[k].class], P[k].class),
          kmoney(P[k].terminal_wealth.median), kmoney(P[k].terminal_wealth.p5), kmoney(P[k].terminal_wealth.p95),
          `${num(P[k].pt_value.mean, 3)} [${num(P[k].pt_value.ci_low, 3)}, ${num(P[k].pt_value.ci_high, 3)}]`,
        ])}
      />
      <p style={{ marginTop: "1rem", maxWidth: "46rem" }}>
        {tx(
          `Recommended: ${pick(POLICY_NAMES[rec])}${a.recommendation.tied_with.length ? ` (statistically tied with ${a.recommendation.tied_with.map((k) => pick(POLICY_NAMES[k])).join(", ")})` : ""}. Data: ${a.data.tickers.length} ETFs, ${a.data.start} to ${a.data.end}${a.data.synthetic ? " (SYNTHETIC FALLBACK)" : " from Yahoo Finance"}. Solver: ${a.solver}. Probability the recommended policy ends below the starting amount: ${pct(P[rec].prob_loss)}.`,
          `Recomendada: ${pick(POLICY_NAMES[rec])}${a.recommendation.tied_with.length ? ` (estadísticamente empatada con ${a.recommendation.tied_with.map((k) => pick(POLICY_NAMES[k])).join(", ")})` : ""}. Datos: ${a.data.tickers.length} ETF, ${a.data.start} a ${a.data.end}${a.data.synthetic ? " (RESPALDO SINTÉTICO)" : " de Yahoo Finance"}. Solver: ${a.solver}. Probabilidad de que la política recomendada termine bajo el monto inicial: ${pct(P[rec].prob_loss)}.`,
        )}{" "}
        <a href="#recommendation" onClick={(e) => { e.preventDefault(); go("recommendation"); }}>{tx("Why, and when that changes", "Por qué, y cuándo cambia")}</a>
      </p>
    </div>
  );
}
