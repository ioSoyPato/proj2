import type { ReactNode } from "react";
import { Eq, M } from "../components/Eq";
import { L, useLang } from "../lib/i18n";
import { Callout } from "../components/ui";

function Element({ name, sub, children }: { name: string; sub: string; children: ReactNode }) {
  return (
    <div className="five">
      <div className="five-name">{name}<span className="muted">{sub}</span></div>
      <div className="prose" style={{ maxWidth: "none" }}>{children}</div>
    </div>
  );
}

export function Model() {
  const { tx } = useLang();
  return (
    <div>
      <h1>{tx("The Powell model", "El modelo de Powell")}</h1>
      <p className="lede">
        <L
          en="Part 3 is a sequential decision problem: each month the client (or a rule acting for them) decides how to hold their wealth, then the market moves. Written in Powell's five elements, every variable has a unit and a time index, so it is always clear what is known when each decision is made."
          es="La Parte 3 es un problema de decisión secuencial: cada mes el cliente (o una regla que actúa por él) decide cómo mantener su riqueza, y después el mercado se mueve. Escrito con los cinco elementos de Powell, cada variable tiene unidad e índice de tiempo, así que siempre está claro qué se sabe cuando se toma cada decisión."
        />
      </p>
      <p className="prose">
        <L
          en={<>Time is monthly, <M>{"t = 0, 1, \\dots, T"}</M> with <M>{"T = 120"}</M> (ten years). There are <M>{"N = 25"}</M> ETFs indexed by <M>{"i"}</M>; asset <M>{"c"}</M> is BIL (1–3 month T-bills), the cash asset.</>}
          es={<>El tiempo es mensual, <M>{"t = 0, 1, \\dots, T"}</M> con <M>{"T = 120"}</M> (diez años). Hay <M>{"N = 25"}</M> ETF indexados por <M>{"i"}</M>; el activo <M>{"c"}</M> es BIL (T-bills de 1–3 meses), el activo de efectivo.</>}
        />
      </p>

      <Element name={tx("1. State", "1. Estado")} sub={tx("what is known at t", "lo que se sabe en t")}>
        <Eq>{"S_t = \\big(W_t,\\; w_t,\\; P_t,\\; \\mathcal{H}_t,\\; \\theta^{\\text{client}}\\big)"}</Eq>
        <ul>
          <li><L en={<><M>{"W_t"}</M>: wealth before trading at the start of month <M>t</M>, in US dollars.</>} es={<><M>{"W_t"}</M>: riqueza antes de operar al inicio del mes <M>t</M>, en dólares.</>} /></li>
          <li><L en={<><M>{"w_t \\in \\Delta^N"}</M>: current (drifted) portfolio weights, fractions of <M>{"W_t"}</M> that sum to 1.</>} es={<><M>{"w_t \\in \\Delta^N"}</M>: pesos actuales (con deriva) del portafolio, fracciones de <M>{"W_t"}</M> que suman 1.</>} /></li>
          <li><L en={<><M>{"P_t = \\max_{s \\le t} W_s"}</M>: running peak of wealth in dollars, so the drawdown <M>{"1 - W_t/P_t"}</M> is observable.</>} es={<><M>{"P_t = \\max_{s \\le t} W_s"}</M>: máximo acumulado de la riqueza en dólares, para que la caída <M>{"1 - W_t/P_t"}</M> sea observable.</>} /></li>
          <li><L en={<><M>{"\\mathcal{H}_t"}</M>: every monthly return observed up to <M>{"t"}</M>, the 2008–2026 history plus the simulated months so far (decimal returns). Policies read trailing windows of it (12 months for chasing, <M>L</M> months for the CFA).</>} es={<><M>{"\\mathcal{H}_t"}</M>: todos los retornos mensuales observados hasta <M>{"t"}</M>, la historia 2008–2026 más los meses simulados hasta ahora (retornos decimales). Las políticas leen ventanas recientes (12 meses para perseguir, <M>L</M> meses para la CFA).</>} /></li>
          <li><L en={<><M>{"\\theta^{\\text{client}} = (\\alpha, \\beta, \\lambda, d, r, k, f)"}</M>: static parameters from the questionnaire (dimensionless, except <M>f</M> in months). Behavioral policies also carry a small memory: cash/invested flag and the trough of the portfolio they left.</>} es={<><M>{"\\theta^{\\text{cliente}} = (\\alpha, \\beta, \\lambda, d, r, k, f)"}</M>: parámetros estáticos del cuestionario (adimensionales, salvo <M>f</M> en meses). Las políticas conductuales llevan además una pequeña memoria: si están en efectivo y el mínimo del portafolio que dejaron.</>} /></li>
        </ul>
      </Element>

      <Element name={tx("2. Decision", "2. Decisión")} sub={tx("chosen at t, after seeing S_t", "elegida en t, tras ver S_t")}>
        <Eq>{"x_t = X^{\\pi}(S_t) \\in \\Delta^N = \\Big\\{x \\in \\mathbb{R}^N_{\\ge 0} : \\textstyle\\sum_i x_{t,i} = 1\\Big\\}"}</Eq>
        <p>
          <L
            en={<>The post-trade target weights. The trade is <M>{"x_t - w_t"}</M>, traded value <M>{"W_t\\,\\lVert x_t - w_t \\rVert_1"}</M> dollars. No shorting and no leverage. At <M>{"t=0"}</M> every policy buys the Part 2 MILP portfolio <M>{"x^{\\star}"}</M>. The decision uses only <M>{"S_t"}</M>: nothing from month <M>{"t+1"}</M> onwards.</>}
            es={<>Los pesos objetivo después de operar. La operación es <M>{"x_t - w_t"}</M>, con valor operado <M>{"W_t\\,\\lVert x_t - w_t \\rVert_1"}</M> dólares. Sin ventas en corto ni apalancamiento. En <M>{"t=0"}</M> toda política compra el portafolio MILP de la Parte 2, <M>{"x^{\\star}"}</M>. La decisión sólo usa <M>{"S_t"}</M>: nada del mes <M>{"t+1"}</M> en adelante.</>}
          />
        </p>
      </Element>

      <Element name={tx("3. Exogenous information", "3. Información exógena")} sub={tx("revealed between t and t+1", "revelada entre t y t+1")}>
        <Eq>{"\\hat R_{t+1} \\in \\mathbb{R}^N, \\qquad \\hat R_{t+1} = R_{\\tau_{t+1}}^{\\text{hist}}"}</Eq>
        <p>
          <L
            en={<>Next month's simple returns of all 25 ETFs (decimal). They are drawn by a block bootstrap: the index sequence <M>{"\\tau"}</M> is built from contiguous blocks of historical months whose length is uniform on <M>{"\\{3,4,5,6\\}"}</M>, which keeps the cross-section of a month intact and preserves short-run momentum and volatility clustering. The same index matrix is used for every policy (common random numbers).</>}
            es={<>Los retornos simples del mes siguiente de los 25 ETF (decimales). Se obtienen con bootstrap en bloques: la secuencia de índices <M>{"\\tau"}</M> se arma con bloques contiguos de meses históricos de longitud uniforme en <M>{"\\{3,4,5,6\\}"}</M>, lo que conserva la sección cruzada de cada mes y la persistencia y agrupamiento de volatilidad de corto plazo. La misma matriz de índices se usa para todas las políticas (números aleatorios comunes).</>}
          />
        </p>
      </Element>

      <Element name={tx("4. Transition", "4. Transición")} sub={tx("how the state moves to t+1", "cómo pasa el estado a t+1")}>
        <Eq>{"W_t^{+} = W_t\\big(1 - c\\,\\lVert x_t - w_t\\rVert_1\\big), \\qquad c = 10\\text{ bp} = 0.001"}</Eq>
        <Eq>{"W_{t+1} = W_t^{+}\\big(1 + x_t^{\\top}\\hat R_{t+1}\\big), \\qquad w_{t+1,i} = \\frac{x_{t,i}\\,(1+\\hat R_{t+1,i})}{1 + x_t^{\\top}\\hat R_{t+1}}"}</Eq>
        <Eq>{"P_{t+1} = \\max(P_t, W_{t+1}), \\qquad \\mathcal{H}_{t+1} = \\mathcal{H}_t \\cup \\{\\hat R_{t+1}\\}"}</Eq>
        <p><L en="Transaction cost is charged on traded value, wealth then compounds at the portfolio return and weights drift with relative performance." es="El costo de transacción se cobra sobre el valor operado; luego la riqueza crece al retorno del portafolio y los pesos se desvían según el desempeño relativo." /></p>
      </Element>

      <Element name={tx("5. Objective", "5. Objetivo")} sub={tx("what a policy is judged by", "con qué se juzga una política")}>
        <Eq>{"\\max_{\\pi \\in \\Pi}\\; \\mathbb{E}\\Big[\\, v\\Big(\\frac{W^{\\pi}_T}{\\text{Ref}} - 1\\Big) \\,\\Big|\\, S_0 \\Big], \\qquad v(x) = \\begin{cases} x^{\\alpha} & x \\ge 0 \\\\ -\\lambda(-x)^{\\beta} & x < 0 \\end{cases}"}</Eq>
        <p>
          <L
            en={<>The client's own prospect-theory value of terminal wealth, measured as a fraction above or below the reference point <M>{"\\text{Ref} = W_0 (1+g)^{10}"}</M> (<M>{"g = 0"}</M> by default: the initial wealth). Expectation is over the bootstrap. We also report terminal wealth (mean, std, P5, P95, 95% CI) and the certainty equivalent <M>{"\\text{Ref}\\,(1 + v^{-1}(\\mathbb{E}[v]))"}</M>, which translates the objective back into dollars.</>}
            es={<>El valor de la teoría prospectiva del propio cliente sobre la riqueza final, medida como fracción por encima o por debajo del punto de referencia <M>{"\\text{Ref} = W_0 (1+g)^{10}"}</M> (<M>{"g = 0"}</M> por defecto: la riqueza inicial). La esperanza es sobre el bootstrap. También se reporta la riqueza final (media, desviación, P5, P95, IC 95%) y el equivalente cierto <M>{"\\text{Ref}\\,(1 + v^{-1}(\\mathbb{E}[v]))"}</M>, que traduce el objetivo de vuelta a dólares.</>}
          />
        </p>
      </Element>

      <Callout tone="neutral">
        <L
          en={<><strong>Why prospect theory as the objective.</strong> The advisory firm's question is not "what maximizes wealth" but "what will this client be happiest with, given how they feel about losses". Using the client's own <M>{"(\\alpha,\\beta,\\lambda)"}</M> makes the same simulation answer differently for different clients.</>}
          es={<><strong>Por qué la teoría prospectiva como objetivo.</strong> La pregunta de la firma no es "qué maximiza la riqueza" sino "con qué estará más satisfecho este cliente, dado cómo siente las pérdidas". Usar los <M>{"(\\alpha,\\beta,\\lambda)"}</M> del propio cliente hace que la misma simulación responda distinto para clientes distintos.</>}
        />
      </Callout>
    </div>
  );
}
