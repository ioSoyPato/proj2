import type { Analysis } from "../lib/api";
import { L, useLang } from "../lib/i18n";
import { Eq, M } from "../components/Eq";
import { ValueFunction } from "../components/charts";
import { Callout, Panel, Table, useFmt } from "../components/ui";

export function ProfilePage({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const { num, money, pct } = useFmt();
  const p = a.profile;
  const d = p.detail;
  return (
    <div>
      <h1>{tx("Client profile", "Perfil del cliente")}</h1>
      <p className="lede">
        <L
          en="Six lottery questions identify the three parameters of the value function; four scenario questions set the parameters of the behavioral policies. Each estimate is a closed-form indifference condition, computed in the backend."
          es="Seis preguntas de loterías identifican los tres parámetros de la función de valor; cuatro preguntas de escenarios fijan los parámetros de las políticas conductuales. Cada estimación es una condición de indiferencia en forma cerrada, calculada en el backend."
        />
      </p>
      <Eq>{"v(x) = \\begin{cases} x^{\\alpha} & x \\ge 0 \\\\ -\\lambda\\,(-x)^{\\beta} & x < 0 \\end{cases}"}</Eq>

      <h2>{tx("Curvature for gains, α", "Curvatura en ganancias, α")}</h2>
      <p className="prose">
        <L
          en={<>The client names the certainty equivalent <M>{"CE"}</M> of a lottery paying <M>{"G"}</M> with probability 1/2 (questions 1 and 2, <M>{"G"}</M> = $1,000 and $10,000). Indifference gives</>}
          es={<>El cliente da el equivalente cierto <M>{"CE"}</M> de una lotería que paga <M>{"G"}</M> con probabilidad 1/2 (preguntas 1 y 2, <M>{"G"}</M> = $1,000 y $10,000). La indiferencia da</>}
        />
      </p>
      <Eq>{"CE^{\\alpha} = \\tfrac12 G^{\\alpha} \\;\\Longrightarrow\\; \\alpha = \\frac{\\ln(1/2)}{\\ln(CE/G)}"}</Eq>

      <h2>{tx("Curvature for losses, β", "Curvatura en pérdidas, β")}</h2>
      <p className="prose">
        <L en={<>The largest sure loss <M>{"CE_L"}</M> the client accepts instead of losing <M>{"L"}</M> with probability 1/2 (questions 3 and 4). <M>{"\\lambda"}</M> cancels:</>}
          es={<>La mayor pérdida segura <M>{"CE_L"}</M> que el cliente acepta en lugar de perder <M>{"L"}</M> con probabilidad 1/2 (preguntas 3 y 4). <M>{"\\lambda"}</M> se cancela:</>} />
      </p>
      <Eq>{"-\\lambda\\,CE_L^{\\beta} = -\\tfrac12\\lambda L^{\\beta} \\;\\Longrightarrow\\; \\beta = \\frac{\\ln(1/2)}{\\ln(CE_L/L)}"}</Eq>

      <h2>{tx("Loss aversion, λ", "Aversión a pérdidas, λ")}</h2>
      <p className="prose">
        <L
          en={<>The smallest win <M>{"G^{*}"}</M> that makes a 50/50 "win <M>{"G^*"}</M>, lose <M>L</M>" bet acceptable (questions 5 and 6, <M>L</M> = $1,000 and $10,000). Outcomes are measured relative to the stake at risk, <M>{"x/L"}</M>, so <M>v</M> is scale-free, the same convention as the simulation, where outcomes are fractions of the reference wealth:</>}
          es={<>La menor ganancia <M>{"G^{*}"}</M> que hace aceptable una apuesta 50/50 "ganar <M>{"G^*"}</M>, perder <M>L</M>" (preguntas 5 y 6, <M>L</M> = $1,000 y $10,000). Los resultados se miden relativos al monto en riesgo, <M>{"x/L"}</M>, así <M>v</M> no depende de la escala, la misma convención de la simulación, donde los resultados son fracciones de la riqueza de referencia:</>}
        />
      </p>
      <Eq>{"\\tfrac12 (G^{*}/L)^{\\alpha} = \\tfrac12 \\lambda \\;\\Longrightarrow\\; \\lambda = (G^{*}/L)^{\\alpha}"}</Eq>
      <p className="prose">
        <L en={<>Each parameter is the geometric mean over its two questions, clipped to <M>{"\\alpha,\\beta \\in [0.25, 1.5]"}</M> and <M>{"\\lambda \\in [0.5, 6]"}</M>.</>}
          es={<>Cada parámetro es la media geométrica de sus dos preguntas, acotada a <M>{"\\alpha,\\beta \\in [0.25, 1.5]"}</M> y <M>{"\\lambda \\in [0.5, 6]"}</M>.</>} />
      </p>

      <Panel title={tx("Worked example: the default answers", "Ejemplo resuelto: las respuestas por defecto")}>
        <div className="grid2">
          <Table
            head={[tx("Question", "Pregunta"), tx("Answer", "Respuesta"), tx("Implied", "Implica")]}
            rows={[
              ...Object.entries(d.alpha_by_question).map(([q, v]) => [q, money(d.answers[q]), `α = ${num(v, 3)}`]),
              ...Object.entries(d.beta_by_question).map(([q, v]) => [q, money(d.answers[q]), `β = ${num(v, 3)}`]),
              ...Object.entries(d.lambda_by_question).map(([q, v]) => [q, money(d.answers[q]), `λ = ${num(v, 3)}`]),
            ]}
          />
          <div>
            <ValueFunction x={p.value_curve.x} v={p.value_curve.v} height={240} compact />
            <p className="small" style={{ textAlign: "center" }}>α = {num(p.alpha, 3)}, β = {num(p.beta, 3)}, λ = {num(p.lam, 3)}</p>
          </div>
        </div>
      </Panel>

      <h2>{tx("Bias flags: scenario questions to policy parameters", "Señales de sesgo: de preguntas de escenario a parámetros de política")}</h2>
      <Table
        leftCols={3}
          head={[tx("Question", "Pregunta"), tx("Answers", "Respuestas"), tx("Parameter", "Parámetro"), tx("Default", "Por defecto")]}
        rows={[
          [tx("7. Portfolio fell 20% in 3 months", "7. El portafolio cayó 20% en 3 meses"), tx("sell all / sell half / hold / buy more", "vendo todo / la mitad / mantengo / compro más"), tx("panic drawdown d = 15% / 25% / 35% / never", "caída de pánico d = 15% / 25% / 35% / nunca"), pct(p.panic_drawdown, 0)],
          [tx("8. Rebound needed to buy back", "8. Rebote necesario para recomprar"), "5% / 10% / 20% / 30%", tx("re-entry recovery r", "recuperación de reingreso r"), pct(p.reentry_recovery, 0)],
          [tx("9. A fund rose 40%, yours 8%", "9. Un fondo subió 40%, el tuyo 8%"), tx("nothing / a quarter / half / most", "nada / un cuarto / la mitad / casi todo"), tx("chasing intensity k = 0 / 25% / 50% / 75%", "intensidad k = 0 / 25% / 50% / 75%"), pct(p.chase_intensity, 0)],
          [tx("10. How often you act", "10. Cada cuánto actúas"), tx("monthly / quarterly / twice a year / yearly", "mensual / trimestral / semestral / anual"), tx("review period f = 1 / 3 / 6 / 12 months", "periodo f = 1 / 3 / 6 / 12 meses"), `${p.review_months}`],
        ]}
      />
      <p className="prose" style={{ marginTop: "1rem" }}>
        <L
          en={<>The link to Part 2 is the CVaR limit: <M>{"C(\\lambda) = \\min\\{\\max\\{0.12/\\lambda,\\; 0.02\\},\\; 0.10\\}"}</M> per month. A loss-neutral client (<M>{"\\lambda = 1"}</M>) accepts an equity-like 10% expected loss in the worst 5% of months; the default client gets <strong>{pct(p.cvar_cap, 2)}</strong>.</>}
          es={<>El vínculo con la Parte 2 es el límite de CVaR: <M>{"C(\\lambda) = \\min\\{\\max\\{0.12/\\lambda,\\; 0.02\\},\\; 0.10\\}"}</M> mensual. Un cliente neutral a pérdidas (<M>{"\\lambda = 1"}</M>) acepta una pérdida esperada de 10% en el peor 5% de los meses, como la renta variable; el cliente por defecto obtiene <strong>{pct(p.cvar_cap, 2)}</strong>.</>}
        />
      </p>
      <Callout tone="neutral">
        <L
          en="Simplifications, stated plainly: no probability weighting (all lotteries are 50/50, which limits its influence), two questions per parameter, and stated rather than revealed preferences. The behavioral mapping is a modeling choice, not an estimate; the sensitivity grids on the Recommendation page show how costs change across the whole range."
          es="Simplificaciones, dichas con claridad: sin ponderación de probabilidades (todas las loterías son 50/50, lo que limita su efecto), dos preguntas por parámetro, y preferencias declaradas en vez de reveladas. El mapeo conductual es una decisión de modelado, no una estimación; las rejillas de sensibilidad en la página de Recomendación muestran cómo cambian los costos en todo el rango."
        />
      </Callout>
    </div>
  );
}
