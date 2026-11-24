# Box Office Pricing: dynamic ticket pricing with Powell's framework

**[English](#english) · [Español](#español)**

---

<a id="english"></a>

## English

A promoter has **2,000 seats** and **60 days** to sell them. Every morning they post one price from a $40–$200 grid. Buyers arrive faster as the show approaches, each with a lognormal willingness to pay, and they remember yesterday's price: anything above it feels like a loss. On the night of the show an empty seat is worth nothing. **Which pricing policy brings in the most money, and how sure can we be?**

This repository answers that end to end. It writes the problem as a sequential decision model with Powell's five elements, builds a vectorised simulator of it, and implements a baseline plus three policies from three different policy classes (PFA, DLA with a daily MILP, and VFA/RL with a numpy Double DQN). All four are evaluated on the same 600 random selling seasons using common random numbers, with seeds kept separate for tuning and evaluation. The results are presented in a bilingual React dashboard where the promoter enters their own venue and audience and gets back a recommended policy, the day-one price, a price path, the revenue distribution and the sell-out probability, plus a "what do I charge today?" tool.

> **Calibrated on real data.** The arrival curve's shape was re-estimated from the Kaggle *Flight Prices* dataset (`dilwong/flightprices`, Expedia 2022). `scripts/calibrate.py` streamed all **31.09 GB / 82.1 M rows** of `itineraries.csv` from the Kaggle API in 469 s without saving the file. It kept **26,858 nonstop flights** on LAX→JFK, ATL→LGA and ORD→LGA, with search dates from 2022-04-16 to 2022-10-05. It inferred bookings from drops in `seatsRemaining` and fitted ȳ<sub>d</sub> = a·e<sup>−b·d</sup>, giving **b = 0.0199 / day (90% flight-level bootstrap CI 0.0194–0.0204, weighted R² = 0.950)**. Per route, b is 0.0227 for LAX-JFK, 0.0293 for ATL-LGA and 0.0149 for ORD-LGA. With that shape, last-day traffic is ×3.2 the first day's, versus ×8 under the uncalibrated default of 0.035. Every result below uses the calibrated shape.

### Headline results (calibrated market, 600 evaluation scenarios, common random numbers)

| Policy | Mean revenue | 95% CI of mean | Std | P5 | P95 | Sell-out prob. | vs fixed (paired) | Beats fixed in |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Fixed price (baseline) | **$193.3k** | $190.8k – $195.8k | $30.8k | $134.4k | $220.0k | 41.5% | — | — |
| Price-schedule rule (PFA) ★ | **$210.8k** | $208.7k – $212.8k | $25.2k | $168.4k | $248.7k | 49.3% | +9.0% ($16.6k … $18.3k) | 96% |
| Daily lookahead MILP (DLA) | **$210.1k** | $208.1k – $212.1k | $24.7k | $168.4k | $248.6k | 89.5% | +8.7% ($15.9k … $17.7k) | 92% |
| RL agent, Double DQN (VFA) | **$188.1k** | $187.0k – $189.3k | $14.6k | $162.9k | $200.3k | 28.2% | -2.7% ($-6.9k … $-3.4k) | 42% |

★ recommended. Revenue is in dollars per event. "vs fixed" is the paired difference, same scenario under both policies, with its 95% CI.

**Recommendation: use the price-schedule rule (PFA).** Open at **$100** and let the price drift up by about $20 over the window. Move it by about $9 for every 1% of capacity that sales run ahead of (or behind) the booking curve. It earns **$210.8k** on average, +9.0% over the best single price ($110, $193.3k), and wins in 96% of scenarios. It also raises the bad-case revenue (P5) from $134.4k to $168.4k. The daily lookahead MILP is nearly as good, at $210.1k. Its paired gap to the rule is only $664 per event (95% CI $549–$778), but the gap is statistically clear. The lookahead sells out far more often (89.5% vs 49.3%), because it holds prices slightly lower and fills the room on the last day. The rule is simpler to run: no solver and no daily re-optimisation. The RL agent (DQN) is the weakest at $188.1k, below even the fixed price. Its single training run under a fixed time budget was unstable: validation revenue peaked after 4,800 episodes and then collapsed, so the early checkpoint is what ships.


### The Powell model

| Element | Definition (units) |
|---|---|
| **State** S<sub>t</sub> | R<sub>t</sub> seats remaining (seats) · d<sub>t</sub> = T − t days left (days) · r<sub>t</sub> reference price ($) · s<sub>t−1</sub> tickets sold yesterday (tickets) · Ê<sub>t</sub> tickets *expected* so far at the posted prices (tickets; with C − R<sub>t</sub> it is a belief state about the unknown demand level) |
| **Decision** x<sub>t</sub> | p<sub>t</sub> ∈ {40, 50, …, 200} ($), posted each morning. Known when deciding: S<sub>t</sub> and the model's structure and parameters. Not known: today's arrivals, their willingness to pay, and the event's demand level M |
| **Exogenous info** W<sub>t+1</sub> | N<sub>t+1</sub> ~ Poisson(M·λ<sub>t</sub>·m<sub>t</sub>) arrivals, with λ<sub>t</sub> ∝ e<sup>−b(d<sub>t</sub>−1)</sup> summing to Λ = 5,200 (b = 0.0199, calibrated) and m<sub>t</sub> = κ = 1.5 when fewer than 10% of seats remain. Willingness to pay ln V ~ N(ln 95, 0.45²). M ~ LogNormal(−σ<sub>D</sub>²/2, σ<sub>D</sub>) with σ<sub>D</sub> = 0.25, drawn once per event (see design decisions) |
| **Transition** | effective price p̃ = p + η·max(p − r, 0) − γ·max(r − p, 0) with η = 0.6 and γ = 0.3. Sales y<sub>t</sub> = min(R<sub>t</sub>, #{V ≥ p̃}). Then R<sub>t+1</sub> = R<sub>t</sub> − y<sub>t</sub>, r<sub>t+1</sub> = θ r<sub>t</sub> + (1 − θ) p<sub>t</sub> with θ = 0.8 and r<sub>0</sub> = $100, and Ê<sub>t+1</sub> = Ê<sub>t</sub> + λ<sub>t</sub> m<sub>t</sub> q(p<sub>t</sub>, r<sub>t</sub>) |
| **Objective** | max<sub>π</sub> E[Σ<sub>t</sub> p<sub>t</sub> y<sub>t</sub>] (undiscounted revenue, $). Reported alongside: std, P5/P95, 95% CI of the mean, and sell-out probability P(R<sub>T</sub> = 0) |

The full derivation, with the KaTeX version and a definition for every symbol, is on the dashboard's **The model** page.

### The policies

| Policy | Powell class | Tunable parameters (tuned on tuning seeds) | Why this method |
|---|---|---|---|
| Fixed price | Baseline | p̄, the best of all 17 grid prices by simulation | It's what most promoters do. Anything smarter has to beat it. |
| Price-schedule rule | **PFA** | p = P₀ + a·t/(T−1) + k·(sold − C·F<sub>t</sub>)/C, rounded to the grid. P₀ is the opening price, a the planned drift, and k the pace sensitivity against a sell-out booking curve F<sub>t</sub> | Uses exactly the two state variables the assignment names, days left and seats remaining. Simple enough to print on a card. |
| Daily lookahead | **DLA** | n₀, the prior strength of the demand-level belief. Structural settings: 3 successive-approximation rounds, 7 daily periods followed by 5-day blocks, 0.1% MIP gap | Each morning it solves a multiple-choice knapsack MILP (one price per future day or block, expected sales ≤ remaining seats) and applies only today's price. Reference-price dynamics are handled by successive approximation. Solved with Gurobi, falling back to HiGHS. |
| RL agent | **VFA** | Q-network weights (Double DQN, 7→128→128→17, numpy), trained offline on its own seed family | Needs no buyer model at decision time. Flagged as out-of-distribution when inputs move more than 20% from training, and excluded if the grid or window change. |

### Evaluation protocol

- **Same simulator, same scenarios:** every policy faces identical random numbers. Each scenario has one demand-level uniform and two uniforms per day, turned into arrivals and purchases by CDF inversion, so outcomes are monotonically coupled.
- **Separate seeds:** tuning uses family 11,000, RL training 22,000 (validation 11,500), final evaluation 99,000 and sensitivity 77,000. A test asserts they never overlap.
- **≥ 500 scenarios:** the final evaluation uses **600**. Each policy is reported with mean, std, P5/P95, a 95% CI of the mean, the sell-out probability with a Wilson CI, and paired differences against the baseline.
- **Decision rule:** recommend the highest mean, unless a *simpler* policy is statistically tied with it (paired 95% CI includes 0). RL is never recommended out of distribution.

### When would the recommendation change? (sensitivity, 60 scenarios per point, own seeds)

| Assumption moved | Values | Highest mean | Recommended |
|---|---|---|---|
| Loss aversion η | 0.1 / 0.6 / 2.5 | rule at every value (gain vs fixed shrinks from $22.0k to $14.6k as η grows) | rule |
| Reference memory θ | 0.5 / 0.8 / 0.95 | rule, rule, **lookahead** at 0.95 (tied) | rule |
| Demand level × default | 0.7 / 1.0 / 1.3 | **lookahead** at 0.7 (tied), rule otherwise | rule |
| Demand uncertainty σ<sub>D</sub> | 0 / 0.4 | rule at 0, where its edge over fixed drops to $1.3k; **lookahead** at 0.4 (tied) | rule |

So the rule is never beaten by a statistically clear margin in these sweeps. The lookahead takes the lead on averages when demand is weak, very uncertain, or when fans' price memory is long, and with more uncertainty or longer memory it would become the recommendation. When the show's popularity is well known (σ<sub>D</sub> → 0), dynamic pricing adds little over a well-chosen fixed price. RL degrades whenever the market moves away from its training point.


### Architecture

```
project-b-dynamic-pricing/
├── Dockerfile                 multi-stage: node build → python:3.12-slim runtime (one port)
├── backend/
│   ├── app/
│   │   ├── config.py          paths, seed families, credentials.env loader (never prints secrets)
│   │   ├── simulator/         params.py · demand.py (purchase rule, q(p,r)) · engine.py (vectorised CRN simulator)
│   │   ├── policies/          rules.py (fixed, PFA) · dla.py (MCKP MILP, Gurobi/HiGHS) · rl.py (numpy Double DQN)
│   │   ├── evaluation/        runner.py (parallel runs, summaries) · tuning.py · study.py (evaluate, recommend, sensitivity)
│   │   ├── calibration/       flights.py (streaming reader + booking-curve estimator)
│   │   └── api/               main.py (FastAPI + static frontend) · schemas.py
│   ├── scripts/               calibrate.py · train_rl.py · precompute.py · report_tables.py
│   ├── data/                  precomputed.json · rl_dqn.npz · rl_dqn_meta.json (calibration.json after calibrating)
│   └── tests/                 pytest sanity checks
├── frontend/                  React 19 + TypeScript + Vite · Recharts · KaTeX · EN/ES i18n · light/dark
│   └── src/{pages,components,lib}
└── docs/REPORT.md             bilingual written report
```

API: `GET /api/meta`, `GET /api/precomputed`, `GET /api/calibration`, `POST /api/evaluate` (live run on the promoter's inputs, 40–300 scenarios), `POST /api/sensitivity` (live sweep), `POST /api/decide` (today's price from a given state), `GET /api/health`.

### How to run

**One command (Docker):**

```bash
docker build -t ticket-pricing . && docker run -p 8002:8000 ticket-pricing
# open http://localhost:8002
```

**Local development (two terminals):**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.api.main:app --port 8002 --reload

cd frontend && npm install && npm run dev      # http://localhost:5182 (talks to :8002, see frontend/.env)
```

**Regenerate every number:**

```bash
cd backend
python -m scripts.calibrate --routes LAX-JFK,ATL-LGA,ORD-LGA   # ~8 min stream; needs credentials (below)
python -m scripts.train_rl       # ~3 min on a laptop, numpy only
python -m scripts.precompute     # tuning → 600-scenario evaluation → sensitivity sweeps
python -m scripts.report_tables  # prints the Markdown tables used in this README
python -m pytest -q
```

**credentials.env** (one level above this folder, git-ignored, read by a small parser in `app/config.py`):

| Key | Needed for | Without it |
|---|---|---|
| `KAGGLE_API_TOKEN` (or `KAGGLE_USERNAME` + `KAGGLE_KEY`) | streaming `itineraries.csv` (~31 GB) from Kaggle and keeping only the route rows. No full download to disk; `--max-gb` stops early | defaults + banner |
| `FLIGHT_PRICES_CSV` | the same, from a local (possibly partial) copy | defaults + banner |
| `GRB_LICENSE_FILE` | a full Gurobi licence | Gurobi's pip *restricted* licence (≤ 2,000 variables/constraints) already covers the lookahead MILP. HiGHS is used if Gurobi is unavailable |

### Design decisions

- **Demand-level uncertainty (σ<sub>D</sub>).** With pure Poisson arrivals, revenue varies by only ~2% across scenarios. A promoter's real uncertainty is whether the show is a hit, so arrivals are scaled by an unobserved M with mean 1. Setting σ<sub>D</sub> = 0 in the dashboard recovers the assignment's model exactly. This is also what gives the "recent sales" state variable a purpose: it lets a policy learn M.
- **CRN by inversion.** The number of willing buyers is exactly Binomial(N, q) under lognormal WTP, so drawing it by inverse CDF gives the right distribution *and* identical randomness for every policy. A test checks it against buyer-by-buyer simulation.
- **DLA tractability.** Exact dominance pruning, temporal aggregation (daily, then 5-day blocks) and a 0.1% gap keep each MILP well under Gurobi's restricted-licence size. A measured comparison found plans within 0.04% of the 0.01%-gap optimum. Day-level DLA is parallelised across processes.
- **RL in numpy.** A ~20k-parameter network does not need PyTorch. Dropping it keeps the image small and identical on Python 3.12 and 3.14. Weights are shipped, so runtime never trains. The best checkpoint is chosen on a validation seed family, never the evaluation one.
- **Live vs precomputed.** The 600-scenario study is precomputed and committed, so it loads instantly. Live runs on the promoter's inputs use 40–300 scenarios (labelled), re-optimise the fixed price, re-tune the rule by pattern search, and re-solve the lookahead.

### Honest limitations

- Flights are a stand-in: `seatsRemaining` is a capped fare-bucket count, so seat drops are a lower-bound proxy for bookings, and only the curve's *shape* transfers to concerts. Shape also varies by route (b from 0.015 to 0.029), and the sensitivity sweeps show how much that matters.
- Buyers are myopic. Nobody waits strategically for a price drop, and resale markets are not modelled.
- The DLA's reference-price handling is an approximation (successive linearisation along an incumbent plan), and it ignores the scarcity boost κ.
- The RL agent underperforms. It had one time-boxed training run on the calibrated market, which peaked early and then collapsed, so the shipped checkpoint (validation $189.2k) loses to the fixed price. With more tuning effort (seeds, learning-rate schedule, reward shaping) it would likely improve. It is also trained for one market: its numbers on other inputs are shown but flagged, and it is never recommended there.
- Live dashboard runs use fewer scenarios than the precomputed study, so their confidence intervals are wider.

---

<a id="español"></a>

## Español

Un promotor tiene **2,000 asientos** y **60 días** para venderlos. Cada mañana publica un precio de una rejilla de $40–$200. Los compradores llegan más rápido conforme se acerca el show, cada uno con una disposición a pagar lognormal, y recuerdan el precio de ayer: cualquier precio por encima de él se siente como una pérdida. La noche del show, un asiento vacío no vale nada. **¿Qué política de precios recauda más, y qué tan seguros podemos estar?**

Este repositorio responde de punta a punta. Plantea el problema como un modelo de decisión secuencial con los cinco elementos de Powell, construye un simulador vectorizado del mismo e implementa una línea base más tres políticas de tres clases distintas (PFA, DLA con un MILP diario, y VFA/RL con una Double DQN en numpy). Las cuatro se evalúan sobre las mismas 600 temporadas de venta aleatorias con números aleatorios comunes, y las semillas de ajuste se mantienen separadas de las de evaluación. Los resultados se presentan en un dashboard bilingüe de React: el promotor ingresa su recinto y su público y recibe la política recomendada, el precio del primer día, la trayectoria de precios, la distribución del ingreso y la probabilidad de agotar, más una herramienta de "¿cuánto cobro hoy?".

> **Calibrado con datos reales.** La forma de la curva de llegadas se re-estimó con el conjunto *Flight Prices* de Kaggle (`dilwong/flightprices`, Expedia 2022). `scripts/calibrate.py` leyó en streaming los **31.09 GB / 82.1 M de filas** de `itineraries.csv` desde la API de Kaggle en 469 s, sin guardar el archivo. Conservó **26,858 vuelos sin escalas** en LAX→JFK, ATL→LGA y ORD→LGA, con fechas de búsqueda del 2022-04-16 al 2022-10-05. Infirió las reservas a partir de las caídas de `seatsRemaining` y ajustó ȳ<sub>d</sub> = a·e<sup>−b·d</sup>, obteniendo **b = 0.0199 / día (IC 90% bootstrap por vuelo 0.0194–0.0204, R² ponderado = 0.950)**. Por ruta, b vale 0.0227 en LAX-JFK, 0.0293 en ATL-LGA y 0.0149 en ORD-LGA. Con esa forma, el tráfico del último día es ×3.2 el del primero, frente a ×8 con el valor por defecto sin calibrar de 0.035. Todos los resultados de abajo usan la forma calibrada.

### Resultados principales (mercado calibrado, 600 escenarios de evaluación, números aleatorios comunes)

| Política | Ingreso medio | IC 95% de la media | Desv. | P5 | P95 | Prob. de agotar | vs fijo (pareado) | Supera al fijo en |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Precio fijo (línea base) | **$193.3k** | $190.8k – $195.8k | $30.8k | $134.4k | $220.0k | 41.5% | — | — |
| Regla de calendario (PFA) ★ | **$210.8k** | $208.7k – $212.8k | $25.2k | $168.4k | $248.7k | 49.3% | +9.0% ($16.6k … $18.3k) | 96% |
| Anticipación diaria MILP (DLA) | **$210.1k** | $208.1k – $212.1k | $24.7k | $168.4k | $248.6k | 89.5% | +8.7% ($15.9k … $17.7k) | 92% |
| Agente RL, Double DQN (VFA) | **$188.1k** | $187.0k – $189.3k | $14.6k | $162.9k | $200.3k | 28.2% | -2.7% ($-6.9k … $-3.4k) | 42% |

★ recomendada. El ingreso está en dólares por evento. "vs fijo" es la diferencia pareada, mismo escenario bajo ambas políticas, con su IC del 95%.

**Recomendación: usar la regla de calendario de precios (PFA).** Abre en **$100** y deja que el precio suba unos $20 a lo largo de la ventana. Muévelo unos $9 por cada 1% de la capacidad que las ventas vayan por delante (o por detrás) de la curva de reservas. Obtiene **$210.8k** en promedio, +9.0% sobre el mejor precio único ($110, $193.3k), y gana en el 96% de los escenarios. También eleva el ingreso del escenario malo (P5) de $134.4k a $168.4k. El MILP de anticipación diaria queda casi igual, en $210.1k. Su brecha pareada con la regla es de apenas $664 por evento (IC 95% $549–$778), pero la brecha es estadísticamente clara. La anticipación agota mucho más seguido (89.5% vs 49.3%), porque mantiene precios un poco más bajos y llena la sala el último día. La regla es más simple de operar: sin solver ni re-optimización diaria. El agente RL (DQN) es el más débil, con $188.1k, por debajo incluso del precio fijo. Su única corrida de entrenamiento, con un presupuesto de tiempo fijo, fue inestable: el ingreso de validación tocó su máximo tras 4,800 episodios y luego colapsó, así que se distribuye ese punto de control temprano.


### El modelo de Powell

| Elemento | Definición (unidades) |
|---|---|
| **Estado** S<sub>t</sub> | R<sub>t</sub> asientos restantes (asientos) · d<sub>t</sub> = T − t días restantes (días) · r<sub>t</sub> precio de referencia ($) · s<sub>t−1</sub> boletos vendidos ayer (boletos) · Ê<sub>t</sub> boletos *esperados* hasta hoy a los precios publicados (boletos; junto con C − R<sub>t</sub> es un estado de creencia sobre el nivel de demanda desconocido) |
| **Decisión** x<sub>t</sub> | p<sub>t</sub> ∈ {40, 50, …, 200} ($), publicado cada mañana. Se conoce al decidir: S<sub>t</sub> y la estructura y parámetros del modelo. No se conoce: las llegadas de hoy, su disposición a pagar ni el nivel de demanda M del evento |
| **Información exógena** W<sub>t+1</sub> | N<sub>t+1</sub> ~ Poisson(M·λ<sub>t</sub>·m<sub>t</sub>) llegadas, con λ<sub>t</sub> ∝ e<sup>−b(d<sub>t</sub>−1)</sup> que suma Λ = 5,200 (b = 0.0199, calibrado) y m<sub>t</sub> = κ = 1.5 si queda menos del 10% de los asientos. Disposición a pagar ln V ~ N(ln 95, 0.45²). M ~ LogNormal(−σ<sub>D</sub>²/2, σ<sub>D</sub>) con σ<sub>D</sub> = 0.25, una vez por evento (ver decisiones de diseño) |
| **Transición** | precio efectivo p̃ = p + η·max(p − r, 0) − γ·max(r − p, 0) con η = 0.6 y γ = 0.3. Ventas y<sub>t</sub> = min(R<sub>t</sub>, #{V ≥ p̃}). Luego R<sub>t+1</sub> = R<sub>t</sub> − y<sub>t</sub>, r<sub>t+1</sub> = θ r<sub>t</sub> + (1 − θ) p<sub>t</sub> con θ = 0.8 y r<sub>0</sub> = $100, y Ê<sub>t+1</sub> = Ê<sub>t</sub> + λ<sub>t</sub> m<sub>t</sub> q(p<sub>t</sub>, r<sub>t</sub>) |
| **Objetivo** | max<sub>π</sub> E[Σ<sub>t</sub> p<sub>t</sub> y<sub>t</sub>] (ingreso sin descontar, $). Se reportan también: desviación estándar, P5/P95, IC 95% de la media y probabilidad de agotar P(R<sub>T</sub> = 0) |

La derivación completa, en KaTeX y con la definición de cada símbolo, está en la página **El modelo** del dashboard.

### Las políticas

| Política | Clase de Powell | Parámetros ajustables (con semillas de ajuste) | Por qué este método |
|---|---|---|---|
| Precio fijo | Línea base | p̄, el mejor de los 17 precios de la rejilla por simulación | Es lo que hace la mayoría de los promotores. Cualquier cosa más lista debe superarlo. |
| Regla de calendario | **PFA** | p = P₀ + a·t/(T−1) + k·(vendidos − C·F<sub>t</sub>)/C, redondeado a la rejilla. P₀ es el precio inicial, a la deriva planeada y k la sensibilidad al ritmo frente a una curva de reservas F<sub>t</sub> que agota justo a tiempo | Usa exactamente las dos variables de estado que pide el enunciado, días restantes y asientos restantes. Cabe en una tarjeta. |
| Anticipación diaria | **DLA** | n₀, la fuerza de la previa sobre el nivel de demanda. Ajustes estructurales: 3 rondas de aproximación sucesiva, 7 periodos diarios seguidos de bloques de 5 días, gap MIP de 0.1% | Cada mañana resuelve un MILP de mochila de elección múltiple (un precio por día o bloque futuro, ventas esperadas ≤ asientos restantes) y aplica solo el precio de hoy. La dinámica del precio de referencia se trata por aproximación sucesiva. Se resuelve con Gurobi, con HiGHS como respaldo. |
| Agente RL | **VFA** | pesos de la red Q (Double DQN, 7→128→128→17, numpy), entrenada fuera de línea con su propia familia de semillas | No necesita un modelo de compradores al decidir. Se marca como fuera de distribución si las entradas se alejan más de 20% del entrenamiento, y se excluye si cambian la rejilla o la ventana. |

### Protocolo de evaluación

- **Mismo simulador, mismos escenarios:** todas las políticas enfrentan los mismos números aleatorios. Cada escenario tiene un uniforme de nivel de demanda y dos uniformes por día, que se convierten en llegadas y compras por inversión de la CDF, así que los resultados quedan acoplados de forma monótona.
- **Semillas separadas:** el ajuste usa la familia 11,000, el entrenamiento RL la 22,000 (validación 11,500), la evaluación final la 99,000 y la sensibilidad la 77,000. Una prueba verifica que nunca se traslapan.
- **≥ 500 escenarios:** la evaluación final usa **600**. De cada política se reporta media, desviación estándar, P5/P95, IC 95% de la media, probabilidad de agotar con IC de Wilson y diferencias pareadas contra la línea base.
- **Regla de decisión:** se recomienda la mayor media, salvo que una política *más simple* empate estadísticamente con ella (el IC 95% pareado incluye 0). RL nunca se recomienda fuera de distribución.

### ¿Cuándo cambiaría la recomendación? (sensibilidad, 60 escenarios por punto, semillas propias)

| Supuesto que se mueve | Valores | Mayor media | Recomendada |
|---|---|---|---|
| Aversión a la pérdida η | 0.1 / 0.6 / 2.5 | la regla en todos (su ganancia vs fijo baja de $22.0k a $14.6k al subir η) | regla |
| Memoria de referencia θ | 0.5 / 0.8 / 0.95 | regla, regla, **anticipación** en 0.95 (empate) | regla |
| Nivel de demanda × base | 0.7 / 1.0 / 1.3 | **anticipación** en 0.7 (empate), regla en los demás | regla |
| Incertidumbre de demanda σ<sub>D</sub> | 0 / 0.4 | regla en 0, donde su ventaja sobre el fijo cae a $1.3k; **anticipación** en 0.4 (empate) | regla |

Así, la regla nunca es superada por un margen estadísticamente claro en estos barridos. La anticipación pasa al frente en promedio cuando la demanda es débil, muy incierta o cuando la memoria de precios del público es larga, y con más incertidumbre o una memoria más larga pasaría a ser la recomendación. Cuando la popularidad del show se conoce bien (σ<sub>D</sub> → 0), el precio dinámico aporta poco sobre un buen precio fijo. RL se degrada en cuanto el mercado se aleja de su punto de entrenamiento.


### Arquitectura

```
project-b-dynamic-pricing/
├── Dockerfile                 multi-etapa: build de node → runtime python:3.12-slim (un solo puerto)
├── backend/
│   ├── app/
│   │   ├── config.py          rutas, familias de semillas, lector de credentials.env (nunca imprime secretos)
│   │   ├── simulator/         params.py · demand.py (regla de compra, q(p,r)) · engine.py (simulador vectorizado con NAC)
│   │   ├── policies/          rules.py (fijo, PFA) · dla.py (MILP de mochila, Gurobi/HiGHS) · rl.py (Double DQN en numpy)
│   │   ├── evaluation/        runner.py (corridas en paralelo, resúmenes) · tuning.py · study.py (evaluar, recomendar, sensibilidad)
│   │   ├── calibration/       flights.py (lector en streaming + estimador de la curva de reservas)
│   │   └── api/               main.py (FastAPI + frontend estático) · schemas.py
│   ├── scripts/               calibrate.py · train_rl.py · precompute.py · report_tables.py
│   ├── data/                  precomputed.json · rl_dqn.npz · rl_dqn_meta.json (calibration.json tras calibrar)
│   └── tests/                 pruebas de cordura con pytest
├── frontend/                  React 19 + TypeScript + Vite · Recharts · KaTeX · i18n EN/ES · claro/oscuro
│   └── src/{pages,components,lib}
└── docs/REPORT.md             reporte escrito bilingüe
```

API: `GET /api/meta`, `GET /api/precomputed`, `GET /api/calibration`, `POST /api/evaluate` (corrida en vivo con las entradas del promotor, 40–300 escenarios), `POST /api/sensitivity` (barrido en vivo), `POST /api/decide` (precio de hoy desde un estado dado), `GET /api/health`.

### Cómo correrlo

**Un comando (Docker):**

```bash
docker build -t ticket-pricing . && docker run -p 8002:8000 ticket-pricing
# abrir http://localhost:8002
```

**Desarrollo local (dos terminales):**

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.api.main:app --port 8002 --reload

cd frontend && npm install && npm run dev      # http://localhost:5182 (habla con :8002, ver frontend/.env)
```

**Regenerar todos los números:**

```bash
cd backend
python -m scripts.calibrate --routes LAX-JFK,ATL-LGA,ORD-LGA   # ~8 min en streaming; requiere credenciales (abajo)
python -m scripts.train_rl       # ~3 min en una laptop, solo numpy
python -m scripts.precompute     # ajuste → evaluación de 600 escenarios → barridos de sensibilidad
python -m scripts.report_tables  # imprime las tablas Markdown de este README
python -m pytest -q
```

**credentials.env** (un nivel arriba de esta carpeta, ignorado por git, lo lee un pequeño parser en `app/config.py`):

| Clave | Para qué | Sin ella |
|---|---|---|
| `KAGGLE_API_TOKEN` (o `KAGGLE_USERNAME` + `KAGGLE_KEY`) | leer `itineraries.csv` (~31 GB) en streaming desde Kaggle y guardar solo las filas de la ruta. No se descarga completo al disco; `--max-gb` detiene antes | valores por defecto + aviso |
| `FLIGHT_PRICES_CSV` | lo mismo, desde una copia local (aunque sea parcial) | valores por defecto + aviso |
| `GRB_LICENSE_FILE` | una licencia completa de Gurobi | la licencia *restringida* del paquete pip de Gurobi (≤ 2,000 variables/restricciones) ya cubre el MILP de anticipación. Si Gurobi no está disponible se usa HiGHS |

### Decisiones de diseño

- **Incertidumbre del nivel de demanda (σ<sub>D</sub>).** Con llegadas Poisson puras, el ingreso varía apenas ~2% entre escenarios. La incertidumbre real del promotor es si el show será un éxito, así que las llegadas se escalan por un M no observado con media 1. Con σ<sub>D</sub> = 0 en el dashboard se recupera exactamente el modelo del enunciado. Esto también le da propósito a la variable de estado "ventas recientes": permite que una política aprenda M.
- **NAC por inversión.** El número de compradores dispuestos es exactamente Binomial(N, q) con disposición a pagar lognormal, así que obtenerlo por la CDF inversa da la distribución correcta *y* azar idéntico para cada política. Una prueba lo contrasta con una simulación comprador por comprador.
- **DLA manejable.** La poda exacta de dominados, la agregación temporal (diaria y luego bloques de 5 días) y un gap de 0.1% mantienen cada MILP muy por debajo del límite de la licencia restringida de Gurobi. Una comparación medida encontró planes a menos de 0.04% del óptimo con gap de 0.01%. La DLA día a día se paraleliza en procesos.
- **RL en numpy.** Una red de ~20 mil parámetros no necesita PyTorch. Prescindir de él mantiene la imagen pequeña e idéntica en Python 3.12 y 3.14. Los pesos vienen incluidos, así que el servidor nunca entrena. El mejor punto de control se elige con una familia de validación, nunca con la de evaluación.
- **En vivo vs precalculado.** El estudio de 600 escenarios está precalculado y versionado, así que carga al instante. Las corridas en vivo con las entradas del promotor usan 40–300 escenarios (etiquetadas), re-optimizan el precio fijo, re-ajustan la regla por búsqueda de patrones y re-resuelven la anticipación.

### Limitaciones honestas

- Un vuelo es un sustituto: `seatsRemaining` es un conteo truncado de la clase tarifaria, así que las caídas de asientos son una cota inferior de las reservas, y solo la *forma* de la curva se transfiere a conciertos. La forma también varía por ruta (b de 0.015 a 0.029), y los barridos de sensibilidad muestran cuánto importa.
- Los compradores son miopes. Nadie espera estratégicamente una baja de precio, y no se modela la reventa.
- El manejo del precio de referencia en la DLA es una aproximación (linealización sucesiva sobre un plan incumbente), e ignora el impulso por escasez κ.
- El agente RL tiene bajo desempeño. Tuvo una sola corrida de entrenamiento con tiempo limitado sobre el mercado calibrado, que tocó su máximo temprano y luego colapsó, así que el punto de control distribuido (validación $189.2k) pierde contra el precio fijo. Con más esfuerzo de ajuste (semillas, calendario de tasa de aprendizaje, moldeado de recompensa) probablemente mejoraría. Además está entrenado para un solo mercado: sus números con otras entradas se muestran pero quedan marcados, y ahí nunca se recomienda.
- Las corridas en vivo usan menos escenarios que el estudio precalculado, así que sus intervalos de confianza son más anchos.

