# Behavior Gap

**[English](#english) | [Español](#español)**

---

## English

**Behavior Gap** is a behavioral portfolio advisor. It profiles an investor with a ten-question prospect-theory questionnaire, builds a mean-CVaR portfolio for them with a mixed-integer program whose risk limit is set by their loss aversion, and then simulates ten years of the client living with that portfolio, as a disciplined rule follower and as themselves, panic selling and chasing included. Everything is computed by a Python backend on real ETF data; a bilingual React app presents it as both a report and an interactive advisor dashboard.

### Headline results (default profile, real run)

Default answers give **α = 0.799, β = 0.893, λ = 2.080**, so the monthly CVaR limit is **5.77%**. $100,000, 10 years, 500 evaluation scenarios (seed 20242002), parameters tuned on 300 separate scenarios (seed 20241001), common random numbers across policies. PT value = prospect-theory value of terminal wealth relative to the initial wealth (the objective).

| Policy | Class | Parameters | Mean wealth | Std | P5 | Median | P95 | 95% CI (mean wealth) | Mean PT value [95% CI] |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| **Buy and hold** | Baseline | none | $387.4k | $178.7k | $176.9k | $352.5k | $687.4k | [$371.8k, $403.1k] | **2.263** [2.167, 2.359] |
| Band rebalancing | PFA | b = 30% | $386.5k | $170.9k | $176.9k | $352.5k | $681.3k | [$371.5k, $401.4k] | 2.258 [2.165, 2.352] |
| Annual re-optimization | CFA | L = 120 mo, θ = 1.25 | $380.8k | $189.9k | $153.4k | $343.5k | $712.7k | [$364.1k, $397.4k] | 2.204 [2.100, 2.309] |
| Panic seller | Behavioral | d = 25%, r = 20% | $378.0k | $174.4k | $161.5k | $345.9k | $681.3k | [$362.7k, $393.3k] | 2.197 [2.101, 2.293] |
| Performance chaser | Behavioral | k = 25%, f = 3 mo | $320.7k | $112.4k | $166.1k | $304.7k | $515.2k | [$310.8k, $330.5k] | 1.844 [1.778, 1.910] |
| You, unassisted | Behavioral | both | $315.3k | $116.0k | $157.3k | $301.8k | $515.2k | [$305.2k, $325.5k] | 1.802 [1.733, 1.871] |

- **Recommendation: buy and hold the MILP portfolio**, statistically tied with band rebalancing (paired PT difference 0.0043, 95% CI [−0.0036, 0.0123]) and significantly better than annual re-optimization (0.0584, CI [0.0204, 0.0964]).
- **The client is the bigger risk.** Versus disciplined band rebalancing on the same scenarios, the client's own tendencies cost a median **−$50.8k** (mean −$71.1k, 95% CI [−$77.6k, −$64.7k]). Panic selling alone: median −$6.6k (it triggers in 24% of histories); chasing alone: median −$47.8k.
- **Sensitivity:** the ranking holds for trading costs 0–100 bp and reference-point targets 0–8%/yr. For λ ≤ 1.5 band rebalancing (b = 15–20%) edges ahead, within the confidence interval. The CFA never wins.
- Portfolio (Gurobi 14.0.0, pip size-limited licence; HiGHS gives the same optimum): XLK 30.0%, GLD 20.3%, BIL 16.3%, QQQ 15.4%, XLV 12.0%, XLP 3.0%, TLT 3.0%; historical return 11.8%/yr, volatility 10.9%/yr, monthly CVaR 5.77% (binding).

### Data

Real data: **25 ETFs in 8 asset classes** (US equity, US sectors, international equity, real estate, government bonds, credit, commodities, cash), downloaded with `yfinance` (auto-adjusted daily closes resampled to month-end), **225 monthly returns, 2008-02 to 2026-10**. `backend/data/prices_monthly.csv`, `returns_monthly.csv` and `metadata.json` are committed, so nothing needs the network at run time.

### The Powell model (summary)

| Element | Definition |
|---|---|
| State `S_t` | wealth `W_t` ($), drifted weights `w_t`, running peak `P_t` ($), return history `H_t` (2008–2026 + simulated months), client parameters `(α, β, λ, d, r, k, f)` |
| Decision `x_t` | post-trade weights on the simplex (no shorts, no leverage), chosen after seeing `S_t` |
| Exogenous info `R_{t+1}` | next month's 25 returns, block bootstrap of historical months (blocks of 3–6) |
| Transition | `W⁺ = W(1 − c‖x − w‖₁)`, c = 10 bp; `W_{t+1} = W⁺(1 + xᵀR)`; weights drift; peak updates |
| Objective | `max_π E[ v(W_T/Ref − 1) ]` with the client's own `v(x) = x^α` (gains), `−λ(−x)^β` (losses) |

Full statement with units and timing on the **Model** page of the app; the app's report pages (Model, Client profile, Portfolio MILP, Policies, Evaluation, Recommendation, Data) are the written report.

### Policies

| Policy | Class | Tunable parameters | Rule |
|---|---|---|---|
| Buy and hold | Baseline | none | buy the MILP portfolio, never trade again |
| Band rebalancing | PFA | band `b` | rebalance to target when any weight drifts more than `b` |
| Annual re-optimization | CFA | lookback `L`, risk multiplier `θ` | re-solve the MILP every 12 months on the last `L` months known at that date, CVaR cap `θ·C(λ)` |
| Panic seller | Behavioral | `d`, `r` (questionnaire) | band policy; all to cash after a drawdown `d`; back in after a `r` rebound from the trough |
| Performance chaser | Behavioral | `k`, `f` (questionnaire) | band policy; every `f` months moves `k` into the trailing-12-month top 3 |
| You, unassisted | Behavioral | `d, r, k, f` | both overlays |

### Architecture

```
backend/
  app/config.py           paths, seeds, credentials.env loader (GRB_LICENSE_FILE)
  app/data/               loads the committed monthly dataset
  app/profile/            questionnaire spec + α, β, λ estimation + CVaR link C(λ)
  app/optimization/       solver layer (Gurobi → HiGHS) + mean-CVaR MILP (Rockafellar–Uryasev)
  app/simulator/          block bootstrap + vectorized Powell simulator
  app/policies/           rule policies (baseline, PFA, behavioral) + CFA with a process pool
  app/evaluation/         metrics, tuning/evaluation pipeline, sensitivity sweeps
  app/api/                FastAPI endpoints; also serves the built frontend
  scripts/download_data.py   yfinance download with backoff
  scripts/precompute.py      full default analysis → data/precomputed_default.json
  tests/                  pytest sanity checks
frontend/                 React + TypeScript + Vite, Recharts, KaTeX, EN/ES
  src/pages/              Overview, Advisor dashboard, Model, Profile, Portfolio, Policies,
                          Evaluation, Recommendation, Data
Dockerfile                node build → python:3.12-slim runtime, one process, one port
```

API: `GET /api/health`, `GET /api/meta`, `GET /api/default` (precomputed, instant), `POST /api/profile`, `POST /api/portfolio`, `POST /api/analyze` (full live re-run, about 10 s).

### How to run

**Docker (one command after building):**

```bash
docker build -t behavior-gap .
docker run -p 8001:8000 behavior-gap      # open http://localhost:8001
```

**Local development (two terminals):**

```bash
# backend (port 8001)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.api.main:app --reload --port 8001

# frontend (port 5181; calls http://localhost:8001, see frontend/.env)
cd frontend
npm install
npm run dev
```

Reproduce the numbers: `python scripts/download_data.py` (optional, refreshes prices), `python -m scripts.precompute` (about 3–4 minutes), `pytest -q`.

**Credentials (optional).** A Gurobi licence is the only credential the project can use. Put `GRB_LICENSE_FILE=/path/to/gurobi.lic` in `credentials.env` (in the project folder or its parent, git-ignored; or point `CREDENTIALS_FILE` at it). Without it, the pip package's size-limited licence is used, and if Gurobi cannot load at all the solver falls back to HiGHS; the app shows which one ran. Set `FORCE_HIGHS=1` to force HiGHS.

### Design decisions

- **Behavioral policies nest the disciplined one.** Panic selling and chasing are overlays on the tuned band policy, so with `d = 100%`, `k = 0` they reproduce it path by path (tested): every dollar of difference is the behavior.
- **Common random numbers and three seeds.** One bootstrap index matrix per run is shared by all policies; tuning, evaluation and sensitivity use separate seeds (tested: no shared paths). Comparisons are paired.
- **Scale-free value function.** Outcomes are fractions of a reference (the stake in the questionnaire, the reference wealth in the simulation), so λ estimated at $1,000 means the same thing for a $100k portfolio.
- **Shrunk means in the MILP.** Asset means are shrunk halfway to the cross-sectional mean; otherwise the MILP just buys past winners up to the caps.
- **Vectorized simulator.** One loop over 120 months, all scenarios as numpy arrays; the CFA's ~4,500 MILPs per run go to a process pool.
- **Precompute + live.** The default analysis (with CFA tuning and all sensitivity sweeps, ~90k MILPs) is precomputed and committed; the dashboard's live run re-estimates the profile, re-solves the MILP, re-tunes the band and re-evaluates all six policies.

### Honest limitations

- **In-sample optimism.** The MILP is fit on the same 2008–2026 history the bootstrap resamples, which favors the static portfolio (and its tech/gold tilt). A walk-forward split would be stricter.
- **The bootstrap keeps memory only within 3–6 month blocks**, so 12-month winners carry little information; this makes chasing look at least as costly as in markets with medium-term momentum. It also cannot generate crises worse than those in the sample.
- **Tuned parameters sit at grid edges** (band 30%, CFA L = 120, θ = 1.25): the data prefer "trade less". The PFA is therefore close to buy-and-hold.
- With the reference at initial wealth, almost no scenario ends in the loss region, so λ acts mostly through the portfolio's CVaR limit rather than through the objective.
- Questionnaire: stated preferences, no probability weighting, two questions per parameter; the mapping from scenario answers to `(d, r, k, f)` is a modeling choice. No taxes, contributions or withdrawals.
- The live endpoint reuses the CFA parameters tuned offline for the default profile (re-tuning takes about a minute).

---

## Español

**Behavior Gap** es un asesor de portafolios conductual. Perfila a un inversionista con un cuestionario de diez preguntas basado en la teoría prospectiva, le construye un portafolio media-CVaR con un programa entero mixto cuyo límite de riesgo depende de su aversión a pérdidas, y luego simula diez años del cliente viviendo con ese portafolio, como seguidor disciplinado de una regla y como él mismo, con ventas de pánico y persecución de rendimientos incluidas. Todo se calcula en un backend de Python con datos reales de ETF; una app de React bilingüe lo presenta como reporte y como tablero interactivo para el asesor.

### Resultados principales (perfil por defecto, corrida real)

Las respuestas por defecto dan **α = 0.799, β = 0.893, λ = 2.080**, así que el límite mensual de CVaR es **5.77%**. $100,000, 10 años, 500 escenarios de evaluación (semilla 20242002), parámetros calibrados en 300 escenarios distintos (semilla 20241001), números aleatorios comunes entre políticas. Valor PT = valor de la teoría prospectiva de la riqueza final respecto a la riqueza inicial (el objetivo).

| Política | Clase | Parámetros | Riqueza media | Desv. | P5 | Mediana | P95 | IC 95% (riqueza media) | Valor PT medio [IC 95%] |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| **Comprar y mantener** | Base | ninguno | $387.4k | $178.7k | $176.9k | $352.5k | $687.4k | [$371.8k, $403.1k] | **2.263** [2.167, 2.359] |
| Rebalanceo por bandas | PFA | b = 30% | $386.5k | $170.9k | $176.9k | $352.5k | $681.3k | [$371.5k, $401.4k] | 2.258 [2.165, 2.352] |
| Re-optimización anual | CFA | L = 120 m, θ = 1.25 | $380.8k | $189.9k | $153.4k | $343.5k | $712.7k | [$364.1k, $397.4k] | 2.204 [2.100, 2.309] |
| Vendedor en pánico | Conductual | d = 25%, r = 20% | $378.0k | $174.4k | $161.5k | $345.9k | $681.3k | [$362.7k, $393.3k] | 2.197 [2.101, 2.293] |
| Perseguidor de rendimientos | Conductual | k = 25%, f = 3 m | $320.7k | $112.4k | $166.1k | $304.7k | $515.2k | [$310.8k, $330.5k] | 1.844 [1.778, 1.910] |
| Tú, sin asesoría | Conductual | ambos | $315.3k | $116.0k | $157.3k | $301.8k | $515.2k | [$305.2k, $325.5k] | 1.802 [1.733, 1.871] |

- **Recomendación: comprar y mantener el portafolio MILP**, estadísticamente empatada con el rebalanceo por bandas (diferencia PT pareada 0.0043, IC 95% [−0.0036, 0.0123]) y significativamente mejor que la re-optimización anual (0.0584, IC [0.0204, 0.0964]).
- **El cliente es el riesgo mayor.** Frente al rebalanceo disciplinado en los mismos escenarios, las tendencias del propio cliente cuestan una mediana de **−$50.8k** (media −$71.1k, IC 95% [−$77.6k, −$64.7k]). Sólo el pánico: mediana −$6.6k (se activa en 24% de las historias); sólo perseguir rendimientos: mediana −$47.8k.
- **Sensibilidad:** el orden se mantiene con costos de 0 a 100 pb y metas de referencia de 0 a 8% anual. Para λ ≤ 1.5 el rebalanceo por bandas (b = 15–20%) queda ligeramente arriba, dentro del intervalo de confianza. La CFA nunca gana.
- Portafolio (Gurobi 14.0.0, licencia limitada del paquete pip; HiGHS da el mismo óptimo): XLK 30.0%, GLD 20.3%, BIL 16.3%, QQQ 15.4%, XLV 12.0%, XLP 3.0%, TLT 3.0%; retorno histórico 11.8% anual, volatilidad 10.9% anual, CVaR mensual 5.77% (activo).

### Datos

Datos reales: **25 ETF en 8 clases de activo** (acciones EE. UU., sectores EE. UU., acciones internacionales, bienes raíces, bonos de gobierno, crédito, materias primas, efectivo), descargados con `yfinance` (cierres diarios ajustados remuestreados a fin de mes), **225 retornos mensuales, 2008-02 a 2026-10**. `backend/data/prices_monthly.csv`, `returns_monthly.csv` y `metadata.json` están en el repositorio: nada necesita red al ejecutarse.

### El modelo de Powell (resumen)

| Elemento | Definición |
|---|---|
| Estado `S_t` | riqueza `W_t` ($), pesos con deriva `w_t`, máximo acumulado `P_t` ($), historia de retornos `H_t` (2008–2026 + meses simulados), parámetros del cliente `(α, β, λ, d, r, k, f)` |
| Decisión `x_t` | pesos después de operar en el simplex (sin cortos ni apalancamiento), elegidos tras ver `S_t` |
| Información exógena `R_{t+1}` | los 25 retornos del mes siguiente, bootstrap en bloques de meses históricos (bloques de 3–6) |
| Transición | `W⁺ = W(1 − c‖x − w‖₁)`, c = 10 pb; `W_{t+1} = W⁺(1 + xᵀR)`; los pesos derivan; el máximo se actualiza |
| Objetivo | `max_π E[ v(W_T/Ref − 1) ]` con la propia `v(x) = x^α` (ganancias), `−λ(−x)^β` (pérdidas) del cliente |

El planteamiento completo, con unidades y temporalidad, está en la página **El modelo de Powell** de la app; las páginas de reporte de la app (Modelo, Perfil, Portafolio MILP, Políticas, Evaluación, Recomendación, Datos) son el reporte escrito.

### Políticas

| Política | Clase | Parámetros calibrables | Regla |
|---|---|---|---|
| Comprar y mantener | Base | ninguno | compra el portafolio MILP y no vuelve a operar |
| Rebalanceo por bandas | PFA | banda `b` | rebalancea al objetivo cuando un peso se desvía más de `b` |
| Re-optimización anual | CFA | ventana `L`, multiplicador `θ` | resuelve el MILP cada 12 meses con los últimos `L` meses conocidos, tope de CVaR `θ·C(λ)` |
| Vendedor en pánico | Conductual | `d`, `r` (cuestionario) | política de bandas; todo a efectivo tras una caída `d`; regresa tras un rebote `r` desde el mínimo |
| Perseguidor de rendimientos | Conductual | `k`, `f` (cuestionario) | política de bandas; cada `f` meses mueve `k` a los 3 mejores de los últimos 12 meses |
| Tú, sin asesoría | Conductual | `d, r, k, f` | ambas capas |

### Arquitectura

```
backend/
  app/config.py           rutas, semillas, lector de credentials.env (GRB_LICENSE_FILE)
  app/data/               carga el conjunto de datos mensual del repositorio
  app/profile/            cuestionario + estimación de α, β, λ + vínculo de CVaR C(λ)
  app/optimization/       capa de solvers (Gurobi → HiGHS) + MILP media-CVaR (Rockafellar–Uryasev)
  app/simulator/          bootstrap en bloques + simulador de Powell vectorizado
  app/policies/           políticas de reglas (base, PFA, conductuales) + CFA con pool de procesos
  app/evaluation/         métricas, calibración/evaluación, barridos de sensibilidad
  app/api/                endpoints FastAPI; también sirve el frontend compilado
  scripts/download_data.py   descarga con yfinance y reintentos
  scripts/precompute.py      análisis completo por defecto → data/precomputed_default.json
  tests/                  pruebas de sanidad con pytest
frontend/                 React + TypeScript + Vite, Recharts, KaTeX, EN/ES
Dockerfile                build de node → runtime python:3.12-slim, un proceso, un puerto
```

API: `GET /api/health`, `GET /api/meta`, `GET /api/default` (precalculado, instantáneo), `POST /api/profile`, `POST /api/portfolio`, `POST /api/analyze` (recálculo completo en vivo, unos 10 s).

### Cómo correrlo

**Docker (un comando después del build):**

```bash
docker build -t behavior-gap .
docker run -p 8001:8000 behavior-gap      # abrir http://localhost:8001
```

**Desarrollo local (dos terminales):**

```bash
# backend (puerto 8001)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.api.main:app --reload --port 8001

# frontend (puerto 5181; llama a http://localhost:8001, ver frontend/.env)
cd frontend
npm install
npm run dev
```

Reproducir los números: `python scripts/download_data.py` (opcional, actualiza precios), `python -m scripts.precompute` (unos 3–4 minutos), `pytest -q`.

**Credenciales (opcional).** La única credencial que el proyecto puede usar es una licencia de Gurobi. Pon `GRB_LICENSE_FILE=/ruta/a/gurobi.lic` en `credentials.env` (en la carpeta del proyecto o en su carpeta padre, ignorado por git; o apunta `CREDENTIALS_FILE` a él). Sin ella se usa la licencia limitada del paquete pip, y si Gurobi no carga el solver cae a HiGHS; la app muestra cuál se usó. `FORCE_HIGHS=1` fuerza HiGHS.

### Decisiones de diseño

- **Las políticas conductuales contienen a la disciplinada.** El pánico y la persecución son capas sobre la política de bandas calibrada; con `d = 100%`, `k = 0` la reproducen trayectoria por trayectoria (probado): cada dólar de diferencia es el comportamiento.
- **Números aleatorios comunes y tres semillas.** Una matriz de índices del bootstrap por corrida, compartida por todas las políticas; calibración, evaluación y sensibilidad usan semillas distintas (probado: sin trayectorias compartidas). Las comparaciones son pareadas.
- **Función de valor sin escala.** Los resultados son fracciones de una referencia (el monto en juego en el cuestionario, la riqueza de referencia en la simulación), así que λ estimada con $1,000 significa lo mismo para un portafolio de $100k.
- **Medias encogidas en el MILP.** Las medias se encogen a la mitad hacia la media de la sección cruzada; si no, el MILP sólo compra a los ganadores pasados hasta sus topes.
- **Simulador vectorizado.** Un solo ciclo sobre 120 meses con todos los escenarios en arreglos de numpy; los ~4,500 MILP de la CFA por corrida van a un pool de procesos.
- **Precálculo + en vivo.** El análisis por defecto (con calibración de la CFA y todos los barridos, ~90k MILP) se precalcula y se incluye; la corrida en vivo del tablero re-estima el perfil, resuelve el MILP, recalibra la banda y re-evalúa las seis políticas.

### Limitaciones honestas

- **Optimismo dentro de muestra.** El MILP se ajusta con la misma historia 2008–2026 que remuestrea el bootstrap, lo que favorece al portafolio estático (y su inclinación a tecnología y oro). Una división walk-forward sería más estricta.
- **El bootstrap sólo conserva memoria dentro de bloques de 3–6 meses**, así que los ganadores de 12 meses llevan poca información; esto hace que perseguir rendimientos se vea al menos tan costoso como en mercados con momentum de mediano plazo. Tampoco puede generar crisis peores que las de la muestra.
- **Los parámetros calibrados quedan en los bordes de la rejilla** (banda 30%, CFA L = 120, θ = 1.25): los datos prefieren "operar menos". La PFA queda por eso cerca de comprar y mantener.
- Con la referencia en la riqueza inicial casi ningún escenario termina en la región de pérdidas, así que λ actúa sobre todo a través del límite de CVaR del portafolio y no del objetivo.
- Cuestionario: preferencias declaradas, sin ponderación de probabilidades, dos preguntas por parámetro; el mapeo de respuestas de escenario a `(d, r, k, f)` es una decisión de modelado. Sin impuestos, aportaciones ni retiros.
- El endpoint en vivo reutiliza los parámetros de la CFA calibrados fuera de línea para el perfil por defecto (recalibrar toma cerca de un minuto).
