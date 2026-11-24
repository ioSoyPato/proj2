# Box Office Pricing: Technical Report / Reporte técnico

**[English](#english) | [Español](#español)**

Every number here comes from `backend/data/precomputed.json` and `backend/data/calibration.json`, produced by `scripts/calibrate.py` (real Kaggle data), `scripts/train_rl.py` and `scripts/precompute.py`; `python -m scripts.report_tables` reprints the tables. Gurobi 14.0.0 solved all 442,127 lookahead MILPs (HiGHS fallback unused). The interactive version of this report is the dashboard.

---

<a id="english"></a>

## English

### 1. The client's problem

A promoter sells **C = 2,000** seats over **T = 60** days. Each morning they post one price from the grid {$40, $50, …, $200}. Unsold seats are worth nothing on the night. Goal: a pricing policy that maximizes expected revenue, also reporting the sell-out probability and the spread of revenue.

### 2. Calibration on real data

The assignment requires re-estimating the arrival curve's shape on the Kaggle *Flight Prices* dataset (Expedia, 2022) as a market with fixed capacity and a deadline.

- **Data:** `itineraries.csv` streamed from the Kaggle API: 31.09 GB, 82.1M rows, 469 s. Nothing was stored except the filtered rows: **26,858 nonstop flights** on LAX→JFK, ATL→LGA and ORD→LGA, search dates 2022-04-16 → 2022-10-05.
- **Estimator:** for each flight, bookings between consecutive searches = drop in `seatsRemaining`. Average bookings by days-to-departure d are fitted with ȳ_d = a·e^(−b·d) by weighted least squares.
- **Result:** **b = 0.0199 / day**, 90% flight-level bootstrap CI [0.0194, 0.0204], weighted R² = 0.950. Per route, b = 0.0227 (LAX-JFK), 0.0293 (ATL-LGA), 0.0149 (ORD-LGA). Last-day traffic is ×3.2 the first day's (the uncalibrated default gave ×8).
- **Transfer:** only the *shape* b is transferred to concerts. The total volume Λ = 5,200 potential buyers is a scenario assumption the promoter can change in the dashboard.

### 3. Powell model

| Element | Definition (units) | Known at decision time |
|---|---|---|
| State S_t | R_t seats remaining (seats); d_t = T − t days left (days); r_t reference price ($); s_{t−1} tickets sold yesterday; Ê_t tickets expected so far at posted prices (with C − R_t, a belief about the demand level) | all of S_t |
| Decision x_t | p_t ∈ {40, 50, …, 200} ($), posted each morning | — |
| Exogenous W_{t+1} | arrivals N_{t+1} ~ Poisson(M·λ_t·m_t), λ_t ∝ e^(−b(d_t−1)), Σλ_t = Λ = 5,200; m_t = κ = 1.5 when < 10% of seats remain; WTP ln V ~ N(ln 95, 0.45²); event demand level M ~ LogNormal(−σ_D²/2, σ_D), σ_D = 0.25, drawn once per event | not known: N, V, M |
| Transition | effective price p̃ = p + η·max(p − r, 0) − γ·max(r − p, 0), η = 0.6, γ = 0.3; sales y_t = min(R_t, #{V ≥ p̃}); R_{t+1} = R_t − y_t; r_{t+1} = θ r_t + (1 − θ) p_t, θ = 0.8, r_0 = $100 | |
| Objective | max_π E[Σ_t p_t y_t] (undiscounted revenue, $); also std, P5/P95, 95% CI, P(sell-out) = P(R_T = 0) | |

**Model extension:** with pure Poisson arrivals, revenue varies only about 2% across scenarios, which is unrealistic for a promoter whose real uncertainty is whether the show is a hit. The hidden level M (mean 1) adds that uncertainty, and σ_D = 0 recovers the assignment's model exactly.

### 4. Policies (baseline + all three optional classes)

| Policy | Class | Tunable parameters | Tuned values | Justification |
|---|---|---|---|---|
| Fixed price | Baseline | p̄ (best of 17 grid prices by simulation) | $110 | what most promoters do |
| Price-schedule rule | PFA | p = P₀ + a·t/(T−1) + k·(sold − C·F_t)/C, rounded to grid; F_t = sell-out booking curve | P₀ = $100, a = $20, k = 900 | uses exactly days left and seats remaining; printable on a card |
| Daily lookahead | DLA | prior strength n₀ of the demand belief (+ structure: 3 successive-approximation rounds, 7 daily periods then 5-day blocks, 0.1% gap) | n₀ = 150 | each morning solves a multiple-choice knapsack MILP (one price per future period, expected sales ≤ remaining seats), applies only today's price; reference-price dynamics by successive linearization |
| RL agent | VFA | Double DQN weights (7→128→128→17 MLP, numpy) | trained on its own seed family | no buyer model needed at decision time |

### 5. Evaluation protocol

- **Common random numbers:** each scenario has one demand-level uniform and two uniforms per day, mapped to arrivals and purchases by CDF inversion. Every policy faces identical randomness, and outcomes are monotonically coupled.
- **Separate seeds:** tuning family 11,000; RL training 22,000 (validation 11,500); evaluation 99,000; sensitivity 77,000. A test asserts no overlap.
- **Final evaluation:** **600 scenarios** (≥ 500 required). Reported: mean, std, P5/P95, 95% CI of the mean, sell-out probability with a Wilson CI, and paired differences.
- **Decision rule:** recommend the highest mean, unless a simpler policy is statistically tied (paired 95% CI contains 0). RL is never recommended out of distribution.

### 6. Results (calibrated market, 600 scenarios)

| Policy | Mean revenue | 95% CI | Std | P5 | P95 | Sell-out | vs fixed (paired, 95% CI) | Beats fixed in |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Fixed $110 (baseline) | $193.3k | $190.8k – $195.8k | $30.8k | $134.4k | $220.0k | 41.5% | — | — |
| **Price-schedule rule (PFA)** | **$210.8k** | $208.7k – $212.8k | $25.2k | $168.4k | $248.7k | 49.3% | +9.0% ($16.6k … $18.3k) | 96% |
| Daily lookahead MILP (DLA) | $210.1k | $208.1k – $212.1k | $24.7k | $168.4k | $248.6k | 89.5% | +8.7% ($15.9k … $17.7k) | 92% |
| RL agent, Double DQN (VFA) | $188.1k | $187.0k – $189.3k | $14.6k | $162.9k | $200.3k | 28.2% | −2.7% (−$6.9k … −$3.4k) | 42% |

PFA − DLA paired edge: **$664 per event**, 95% CI [$549, $778]; the rule wins 73.5% of scenarios head to head.

### 7. Recommendation

**Use the price-schedule rule.** Open at **$100** and let the price drift up about $20 over the 60 days. Move it about $9 for every 1% of capacity that sales run ahead of (or behind) the booking curve.

- **Revenue:** +9.0% over the best fixed price, winning in 96% of scenarios.
- **Downside:** it raises the bad-case revenue (P5) from $134.4k to $168.4k.
- **Versus the lookahead:** its edge is small but statistically clear, and it needs no solver or daily optimization.
- **If filling the room matters:** a sold-out show is worth something beyond ticket revenue (sponsors, atmosphere, merch). The lookahead sells out 89.5% of the time vs 49.3%, at a cost of only about $0.7k per event.

**When it would change** (sensitivity, 60 scenarios per point, own seeds):

| Assumption | Values | Highest mean | Recommended |
|---|---|---|---|
| Loss aversion η | 0.1 / 0.6 / 2.5 | rule at every value (gain vs fixed shrinks $22.0k → $14.6k) | rule |
| Reference memory θ | 0.5 / 0.8 / 0.95 | rule, rule, lookahead (tied) | rule |
| Demand × default | 0.7 / 1.0 / 1.3 | lookahead at 0.7 (tied), rule otherwise | rule |
| Demand uncertainty σ_D | 0 / 0.4 | rule at 0 (edge over fixed only $1.3k); lookahead at 0.4 (tied) | rule |

Weaker demand, higher uncertainty about popularity, or longer price memory push toward the lookahead. If the show's popularity is well known (σ_D → 0), a well-chosen fixed price is nearly as good as any dynamic policy. Stronger loss aversion among fans shrinks the value of dynamic pricing.

### 8. Limitations

- Flights are a stand-in: `seatsRemaining` is a capped fare-bucket count, so seat drops are a lower bound on bookings, and only the curve's shape transfers. The shape also varies by route (b from 0.015 to 0.029).
- Buyers are myopic: no strategic waiting, no resale market.
- The DLA's reference-price handling is an approximation, and it ignores the scarcity boost κ.
- The RL agent underperforms. One time-boxed training run peaked at 4,800 episodes (validation $189.2k) and then collapsed, and the early checkpoint ships. More tuning (seeds, learning-rate schedule, reward shaping) would likely help.
- To fit the time budget, the final evaluation uses 600 scenarios (not 1,000) and sensitivity uses 60 per point. `python -m scripts.precompute --n-eval 1000 --full-sweeps` restores the full study.

---

<a id="español"></a>

## Español

### 1. El problema del cliente

Un promotor vende **C = 2,000** lugares durante **T = 60** días. Cada mañana fija un precio de la rejilla {$40, $50, …, $200}. Los boletos no vendidos valen cero la noche del evento. Objetivo: una política de precios que maximice el ingreso esperado, reportando además la probabilidad de agotar y la dispersión del ingreso.

### 2. Calibración con datos reales

La tarea pide re-estimar la forma de la curva de llegadas con el conjunto *Flight Prices* de Kaggle (Expedia, 2022), como mercado con capacidad fija y fecha límite.

- **Datos:** `itineraries.csv` leído en streaming desde la API de Kaggle: 31.09 GB, 82.1 M filas, 469 s. Sólo se guardaron las filas filtradas: **26,858 vuelos directos** LAX→JFK, ATL→LGA y ORD→LGA, búsquedas del 2022-04-16 al 2022-10-05.
- **Estimador:** para cada vuelo, reservas entre búsquedas consecutivas = caída en `seatsRemaining`. Las reservas promedio por días a la salida d se ajustan con ȳ_d = a·e^(−b·d) por mínimos cuadrados ponderados.
- **Resultado:** **b = 0.0199 / día**, IC bootstrap al 90% por vuelo [0.0194, 0.0204], R² ponderado = 0.950. Por ruta, b = 0.0227 (LAX-JFK), 0.0293 (ATL-LGA), 0.0149 (ORD-LGA). El tráfico del último día es ×3.2 el del primero (el valor por defecto sin calibrar daba ×8).
- **Transferencia:** sólo la *forma* b se transfiere a conciertos. El volumen total Λ = 5,200 compradores potenciales es un supuesto de escenario que el promotor puede cambiar en el tablero.

### 3. Modelo de Powell

| Elemento | Definición (unidades) | Conocido al decidir |
|---|---|---|
| Estado S_t | R_t lugares restantes; d_t = T − t días restantes; r_t precio de referencia ($); s_{t−1} boletos vendidos ayer; Ê_t boletos esperados hasta hoy a los precios publicados (junto con C − R_t, una creencia sobre el nivel de demanda) | todo S_t |
| Decisión x_t | p_t ∈ {40, 50, …, 200} ($), publicado cada mañana | — |
| Exógena W_{t+1} | llegadas N_{t+1} ~ Poisson(M·λ_t·m_t), λ_t ∝ e^(−b(d_t−1)), Σλ_t = Λ = 5,200; m_t = κ = 1.5 si queda < 10% de lugares; disposición a pagar ln V ~ N(ln 95, 0.45²); nivel de demanda del evento M ~ LogNormal(−σ_D²/2, σ_D), σ_D = 0.25, una vez por evento | desconocidos: N, V, M |
| Transición | precio efectivo p̃ = p + η·max(p − r, 0) − γ·max(r − p, 0), η = 0.6, γ = 0.3; ventas y_t = min(R_t, #{V ≥ p̃}); R_{t+1} = R_t − y_t; r_{t+1} = θ r_t + (1 − θ) p_t, θ = 0.8, r_0 = $100 | |
| Objetivo | max_π E[Σ_t p_t y_t] (ingreso sin descontar, $); además desv. est., P5/P95, IC 95%, P(agotar) = P(R_T = 0) | |

**Extensión del modelo:** con llegadas Poisson puras el ingreso varía sólo cerca de 2% entre escenarios, lo cual no es realista para un promotor cuya incertidumbre real es si el show será un éxito. El nivel oculto M (media 1) agrega esa incertidumbre, y σ_D = 0 recupera exactamente el modelo de la tarea.

### 4. Políticas (base + las tres clases opcionales)

| Política | Clase | Parámetros calibrables | Valores calibrados | Justificación |
|---|---|---|---|---|
| Precio fijo | Base | p̄ (el mejor de 17 precios por simulación) | $110 | lo que hace la mayoría de los promotores |
| Regla de calendario de precios | PFA | p = P₀ + a·t/(T−1) + k·(vendidos − C·F_t)/C, redondeado a la rejilla; F_t = curva de reservas hasta agotar | P₀ = $100, a = $20, k = 900 | usa exactamente días restantes y lugares restantes; cabe en una tarjeta |
| Lookahead diario | DLA | fuerza n₀ de la creencia previa sobre la demanda (+ estructura: 3 rondas de aproximación sucesiva, 7 periodos diarios y luego bloques de 5 días, gap 0.1%) | n₀ = 150 | cada mañana resuelve un MILP de mochila de elección múltiple (un precio por periodo futuro, ventas esperadas ≤ lugares restantes) y aplica sólo el precio de hoy; la dinámica del precio de referencia se maneja por linealización sucesiva |
| Agente RL | VFA | pesos de una Double DQN (MLP 7→128→128→17, numpy) | entrenado con su propia familia de semillas | no necesita modelo de compradores al decidir |

### 5. Protocolo de evaluación

- **Números aleatorios comunes:** cada escenario tiene un uniforme de nivel de demanda y dos uniformes por día, convertidos en llegadas y compras por inversión de la CDF. Todas las políticas enfrentan la misma aleatoriedad, con resultados acoplados monótonamente.
- **Semillas separadas:** calibración familia 11,000; entrenamiento RL 22,000 (validación 11,500); evaluación 99,000; sensibilidad 77,000. Una prueba verifica que no se traslapen.
- **Evaluación final:** **600 escenarios** (se piden ≥ 500). Se reportan media, desv. est., P5/P95, IC 95% de la media, probabilidad de agotar con IC de Wilson y diferencias pareadas.
- **Regla de decisión:** recomendar la mayor media, salvo que una política más simple esté estadísticamente empatada (IC pareado al 95% contiene 0). RL nunca se recomienda fuera de distribución.

### 6. Resultados (mercado calibrado, 600 escenarios)

| Política | Ingreso medio | IC 95% | Desv. | P5 | P95 | Agotar | vs fijo (pareado, IC 95%) | Supera al fijo en |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Fijo $110 (base) | $193.3k | $190.8k – $195.8k | $30.8k | $134.4k | $220.0k | 41.5% | — | — |
| **Regla de calendario (PFA)** | **$210.8k** | $208.7k – $212.8k | $25.2k | $168.4k | $248.7k | 49.3% | +9.0% ($16.6k … $18.3k) | 96% |
| Lookahead diario MILP (DLA) | $210.1k | $208.1k – $212.1k | $24.7k | $168.4k | $248.6k | 89.5% | +8.7% ($15.9k … $17.7k) | 92% |
| Agente RL, Double DQN (VFA) | $188.1k | $187.0k – $189.3k | $14.6k | $162.9k | $200.3k | 28.2% | −2.7% (−$6.9k … −$3.4k) | 42% |

Ventaja pareada PFA − DLA: **$664 por evento**, IC 95% [$549, $778]; la regla gana 73.5% de los escenarios frente a frente.

### 7. Recomendación

**Usar la regla de calendario de precios.** Abrir en **$100** y dejar que el precio suba unos $20 a lo largo de los 60 días. Moverlo unos $9 por cada 1% de capacidad que las ventas vayan adelantadas (o atrasadas) respecto a la curva de reservas.

- **Ingreso:** +9.0% sobre el mejor precio fijo, ganando en 96% de los escenarios.
- **Peor caso:** sube el ingreso en el peor caso (P5) de $134.4k a $168.4k.
- **Frente al lookahead:** su ventaja es pequeña pero estadísticamente clara, y no requiere solver ni optimización diaria.
- **Si llenar el recinto importa:** un show agotado vale algo más que el ingreso por boletos (patrocinios, ambiente, mercancía). El lookahead agota 89.5% de las veces contra 49.3%, a un costo de apenas unos $0.7k por evento.

**Cuándo cambiaría** (sensibilidad, 60 escenarios por punto, semillas propias):

| Supuesto | Valores | Mayor media | Recomendada |
|---|---|---|---|
| Aversión a pérdidas η | 0.1 / 0.6 / 2.5 | la regla en todos (ganancia vs fijo baja de $22.0k a $14.6k) | regla |
| Memoria del precio θ | 0.5 / 0.8 / 0.95 | regla, regla, lookahead (empate) | regla |
| Demanda × base | 0.7 / 1.0 / 1.3 | lookahead en 0.7 (empate), regla en el resto | regla |
| Incertidumbre de demanda σ_D | 0 / 0.4 | regla en 0 (ventaja vs fijo de sólo $1.3k); lookahead en 0.4 (empate) | regla |

Una demanda más débil, más incertidumbre sobre la popularidad o una memoria de precios más larga empujan hacia el lookahead. Si la popularidad del show se conoce bien (σ_D → 0), un buen precio fijo es casi tan bueno como cualquier política dinámica. Una mayor aversión a pérdidas del público reduce el valor de los precios dinámicos.

### 8. Limitaciones

- Los vuelos son un sustituto: `seatsRemaining` es un conteo truncado por clase tarifaria, así que las caídas son una cota inferior de las reservas y sólo se transfiere la forma de la curva. La forma además varía por ruta (b de 0.015 a 0.029).
- Compradores miopes: nadie espera estratégicamente una baja de precio y no hay reventa.
- El manejo del precio de referencia en el DLA es una aproximación e ignora el impulso por escasez κ.
- El agente RL rinde poco. Un solo entrenamiento con tiempo limitado alcanzó su pico a los 4,800 episodios (validación $189.2k) y luego colapsó; se entrega ese punto temprano. Más ajuste (semillas, calendario de tasa de aprendizaje, reward shaping) probablemente lo mejoraría.
- Por tiempo, la evaluación final usa 600 escenarios (no 1,000) y la sensibilidad 60 por punto. `python -m scripts.precompute --n-eval 1000 --full-sweeps` restaura el estudio completo.
