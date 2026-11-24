# Behavior Gap: Technical Report / Reporte técnico

**[English](#english) | [Español](#español)**

Every number in this report comes from `backend/data/precomputed_default.json`, produced by `python -m scripts.precompute` (real `yfinance` data, Gurobi 14.0.0; HiGHS reproduces the same optimum). The interactive version of this report is the app itself (pages *Model → Recommendation*).

---

## English

### 1. The client's problem

An advisory firm wants a tool that (i) profiles a client, (ii) builds a portfolio that fits that profile, and (iii) shows how the client's own behavior changes the long-term outcome. The decision is sequential: every month the client (or the rule they follow) decides how much to trade, after seeing the market so far, and before knowing next month's returns.

### 2. Data

25 ETFs in 8 asset classes (US equity, US sectors, international equity, real estate, government bonds, credit, commodities, cash), auto-adjusted daily closes from `yfinance`, resampled to month-end: **225 monthly returns, 2008-02 → 2026-10**. Files are committed in `backend/data/`, so nothing needs the network at run time.

### 3. Part 1: Client profile (prospect theory)

Value function, outcomes measured as fractions of the stake:

$$v(x)=\begin{cases}x^{\alpha} & x\ge 0\\ -\lambda(-x)^{\beta} & x<0\end{cases}$$

| Parameter | Question type | Indifference condition | Estimator |
|---|---|---|---|
| α (gain curvature) | certainty equivalent CE of a 50/50 gamble "win G or nothing" (2 stakes: $1k, $10k) | CE^α = ½ G^α | α = ln(½) / ln(CE/G) |
| β (loss curvature) | largest sure loss CE_L accepted instead of 50/50 "lose L or nothing" (2 stakes) | −λ CE_L^β = −½ λ L^β (λ cancels) | β = ln(½) / ln(CE_L/L) |
| λ (loss aversion) | smallest win G* that makes 50/50 "win G* or lose L" acceptable (2 stakes) | ½ (G*/L)^α = ½ λ | λ = (G*/L)^α |

Per-question estimates are combined with a geometric mean and clipped to plausible ranges. Four scenario questions (e.g. "your portfolio fell 20% in three months; what do you do?") set the behavioral parameters used in Part 3: panic drawdown *d*, re-entry recovery *r*, chasing intensity *k* and chasing frequency *f*.

**Default client:** α = 0.799, β = 0.893, **λ = 2.080** (losses hurt about twice as much as equal gains please).

### 4. Part 2: Portfolio construction (MILP)

Mean-CVaR with the Rockafellar–Uryasev linearization over the S = 225 historical monthly scenarios. Decision vector [w, z, ξ, η]:

$$\max_{w,z,\xi,\eta}\ \hat\mu^\top w$$

subject to: Σw_i = 1, w ≥ 0 (no shorts); Σz_i ≤ K = 8; l·z_i ≤ w_i ≤ u·z_i with l = 3%, u = 30%; Σ_{i∈g} w_i ≤ 45% for every asset class g; ξ_s ≥ −r_sᵀw − η, ξ_s ≥ 0; and

$$\eta+\frac{1}{(1-a)S}\sum_s \xi_s \le C(\lambda),\qquad a=0.95,\qquad C(\lambda)=\operatorname{clip}\!\left(\tfrac{0.12}{\lambda},\,2\%,\,10\%\right).$$

**Link to the profile:** the more loss-averse the client, the tighter the monthly CVaR cap. For λ = 2.080, C = **5.77%** (binding at the optimum). Means are shrunk halfway to the cross-sectional mean, because 18 years of monthly data are too noisy to trust asset by asset. A test checks that the linearized CVaR equals the empirical CVaR of the optimal weights.

**Recommended portfolio:** XLK 30.0%, GLD 20.3%, BIL 16.3%, QQQ 15.4%, XLV 12.0%, XLP 3.0%, TLT 3.0%. Historical return 11.8%/yr, volatility 10.9%/yr.

### 5. Part 3: Powell model of the client's behavior

| Element | Definition and units | Known when deciding |
|---|---|---|
| State S_t | wealth W_t ($); drifted weights w_t (fractions); running peak P_t ($); return history H_t; client parameters (α, β, λ, d, r, k, f) | all of it, at the start of month t |
| Decision x_t | post-trade weights on the simplex (no shorts, no leverage); trades = x_t − w_t | chosen after observing S_t |
| Exogenous W_{t+1} | next month's 25 returns R_{t+1}, block bootstrap of historical months, blocks of 3–6 months | not known at t |
| Transition S^M | W⁺_t = W_t(1 − c‖x_t − w_t‖₁), c = 10 bp; W_{t+1} = W⁺_t(1 + x_tᵀR_{t+1}); weights drift with returns; P_{t+1} = max(P_t, W_{t+1}) | |
| Objective | max_π E[ v(W_T / Ref − 1) ], T = 120 months, Ref = initial wealth ($100,000), using the client's own v | evaluated at T |

Also reported: mean, standard deviation, P5/median/P95 of terminal wealth.

### 6. Policies

| Policy | Class | Tunable parameters | Tuned value | Why this method |
|---|---|---|---|---|
| Buy and hold | Baseline | none | — | the simplest thing an advisor can do |
| Band rebalancing | PFA | band width b | b = 30% | a transparent rule a client can follow; one parameter, tuned by simulation |
| Annual MILP re-solve | CFA | lookback L, CVaR multiplier θ | L = 120 mo, θ = 1.25 | re-uses Part 2 with information available at each re-solve date (no look-ahead) |
| Panic seller | Behavioral | d, r (from questionnaire) | d = 25%, r = 20% | band policy + "to cash after a d drawdown, back after an r recovery" |
| Performance chaser | Behavioral | k, f (from questionnaire) | k = 25%, f = 3 mo | band policy + every f months move k into the trailing-12-month top 3 |
| You, unassisted | Behavioral | d, r, k, f | as above | both overlays |

Behavioral policies are overlays on the tuned band policy, so with d = 100% and k = 0 they reproduce it path by path (tested). Every dollar of difference is therefore attributable to behavior.

### 7. Evaluation protocol

- **Common random numbers:** one bootstrap index matrix per run, shared by every policy; comparisons are paired.
- **Separate seeds:** tuning on 300 scenarios (seed 20241001), final evaluation on **500** scenarios (seed 20242002), sensitivity sweeps on their own seed. A test checks the paths don't overlap.
- **Reported:** mean, standard deviation, P5, median, P95 and a 95% confidence interval.

### 8. Results ($100,000, 10 years, 500 evaluation scenarios)

| Policy | Class | Mean | Std | P5 | Median | P95 | Mean PT value [95% CI] |
|---|---|---:|---:|---:|---:|---:|---:|
| **Buy and hold** | Baseline | $387.4k | $178.7k | $176.9k | $352.5k | $687.4k | **2.263** [2.167, 2.359] |
| Band rebalancing | PFA | $386.5k | $170.9k | $176.9k | $352.5k | $681.3k | 2.258 [2.165, 2.352] |
| Annual MILP re-solve | CFA | $380.8k | $189.9k | $153.4k | $343.5k | $712.7k | 2.204 [2.100, 2.309] |
| Panic seller | Behavioral | $378.0k | $174.4k | $161.5k | $345.9k | $681.3k | 2.197 [2.101, 2.293] |
| Performance chaser | Behavioral | $320.7k | $112.4k | $166.1k | $304.7k | $515.2k | 1.844 [1.778, 1.910] |
| You, unassisted | Behavioral | $315.3k | $116.0k | $157.3k | $301.8k | $515.2k | 1.802 [1.733, 1.871] |

Paired differences in PT value:
- buy-and-hold − band = 0.0043, 95% CI [−0.0036, 0.0123]: **not significant**;
- buy-and-hold − CFA = 0.0584, 95% CI [0.0204, 0.0964]: **significant**.

**Cost of behavior** (client's own tendencies vs disciplined band rebalancing, same scenarios):
- combined: median **−$50.8k**, mean −$71.1k, 95% CI [−$77.6k, −$64.7k];
- panic selling alone: median −$6.6k (it triggers in 24% of histories);
- chasing alone: median −$47.8k.

### 9. Recommendation

**Hold the MILP portfolio; rebalance only on wide bands.** Buy-and-hold and 30% band rebalancing are statistically tied, and band rebalancing gives the client a concrete rule. Both beat annual re-optimization, which adds estimation noise and trading costs without adding value. The most valuable thing the advisor can do is **keep the client from acting on their tendencies**: that is worth about $51k of median terminal wealth, more than five times the $9.1k gap between the best and worst disciplined strategy.

**When the recommendation would change** (sensitivity sweeps):
- *Low loss aversion (λ ≤ 1.5):* tighter band rebalancing (b = 15–20%) edges ahead, within the confidence interval.
- *Trading costs:* the ranking holds from 0 to 100 bp.
- *Higher target (reference point 0–8%/yr growth):* the ranking holds.
- *The CFA never wins* in any sweep. It would need a regime where the past 10 years are informative about the next one, which this data doesn't show.

### 10. Limitations

- In-sample optimism: the MILP is fit on the same history the bootstrap resamples, which favors the static portfolio and its tech/gold tilt. A walk-forward split would be stricter.
- The block bootstrap keeps memory only within 3–6 month blocks, so 12-month winners carry little signal, which makes chasing look costly. It also cannot generate crises worse than the sample's.
- Tuned parameters sit at grid edges (b = 30%, L = 120, θ = 1.25): the data say "trade less".
- With the reference at initial wealth, few scenarios end in losses, so λ acts mainly through the CVaR cap.
- Stated (not revealed) preferences, no probability weighting, two questions per parameter; no taxes, contributions or withdrawals.

---

## Español

### 1. El problema del cliente

Una firma de asesoría quiere una herramienta que (i) perfile al cliente, (ii) le construya un portafolio acorde a ese perfil y (iii) muestre cómo su propio comportamiento cambia el resultado de largo plazo. La decisión es secuencial: cada mes el cliente (o la regla que sigue) decide cuánto operar, tras ver el mercado hasta ese momento y antes de conocer los retornos del mes siguiente.

### 2. Datos

25 ETF en 8 clases de activo (acciones EE. UU., sectores EE. UU., acciones internacionales, bienes raíces, bonos de gobierno, crédito, materias primas, efectivo), cierres diarios ajustados de `yfinance` remuestreados a fin de mes: **225 retornos mensuales, 2008-02 → 2026-10**. Los archivos están en `backend/data/`; nada requiere red al ejecutarse.

### 3. Parte 1: Perfil del cliente (teoría prospectiva)

Función de valor, con resultados medidos como fracción del monto en juego:

$$v(x)=\begin{cases}x^{\alpha} & x\ge 0\\ -\lambda(-x)^{\beta} & x<0\end{cases}$$

| Parámetro | Tipo de pregunta | Condición de indiferencia | Estimador |
|---|---|---|---|
| α (curvatura en ganancias) | equivalente cierto CE de una lotería 50/50 "ganar G o nada" (2 montos: $1k, $10k) | CE^α = ½ G^α | α = ln(½) / ln(CE/G) |
| β (curvatura en pérdidas) | mayor pérdida segura CE_L aceptada en lugar de 50/50 "perder L o nada" (2 montos) | −λ CE_L^β = −½ λ L^β (λ se cancela) | β = ln(½) / ln(CE_L/L) |
| λ (aversión a pérdidas) | menor ganancia G* que hace aceptable 50/50 "ganar G* o perder L" (2 montos) | ½ (G*/L)^α = ½ λ | λ = (G*/L)^α |

Las estimaciones por pregunta se combinan con media geométrica y se acotan a rangos plausibles. Cuatro preguntas de escenario (p. ej. "tu portafolio cayó 20% en tres meses; ¿qué haces?") fijan los parámetros conductuales de la Parte 3: caída de pánico *d*, recuperación de reentrada *r*, intensidad *k* y frecuencia *f* de persecución de rendimientos.

**Cliente por defecto:** α = 0.799, β = 0.893, **λ = 2.080** (las pérdidas duelen aproximadamente el doble de lo que agradan ganancias iguales).

### 4. Parte 2: Construcción del portafolio (MILP)

Media-CVaR con la linealización de Rockafellar–Uryasev sobre los S = 225 escenarios mensuales históricos. Vector de decisión [w, z, ξ, η]:

$$\max_{w,z,\xi,\eta}\ \hat\mu^\top w$$

sujeto a: Σw_i = 1, w ≥ 0 (sin cortos); Σz_i ≤ K = 8; l·z_i ≤ w_i ≤ u·z_i con l = 3%, u = 30%; Σ_{i∈g} w_i ≤ 45% por clase de activo g; ξ_s ≥ −r_sᵀw − η, ξ_s ≥ 0; y

$$\eta+\frac{1}{(1-a)S}\sum_s \xi_s \le C(\lambda),\qquad a=0.95,\qquad C(\lambda)=\operatorname{clip}\!\left(\tfrac{0.12}{\lambda},\,2\%,\,10\%\right).$$

**Vínculo con el perfil:** entre más aversión a pérdidas, más estricto el tope mensual de CVaR. Con λ = 2.080, C = **5.77%** (activo en el óptimo). Las medias se encogen a la mitad hacia la media de la sección cruzada, porque 18 años de datos mensuales son demasiado ruidosos para confiar en cada activo por separado. Una prueba verifica que el CVaR linealizado coincide con el CVaR empírico de los pesos óptimos.

**Portafolio recomendado:** XLK 30.0%, GLD 20.3%, BIL 16.3%, QQQ 15.4%, XLV 12.0%, XLP 3.0%, TLT 3.0%. Retorno histórico 11.8% anual, volatilidad 10.9% anual.

### 5. Parte 3: Modelo de Powell del comportamiento del cliente

| Elemento | Definición y unidades | Conocido al decidir |
|---|---|---|
| Estado S_t | riqueza W_t ($); pesos con deriva w_t (fracciones); máximo acumulado P_t ($); historia de retornos H_t; parámetros del cliente (α, β, λ, d, r, k, f) | todo, al inicio del mes t |
| Decisión x_t | pesos después de operar en el simplex (sin cortos ni apalancamiento); operaciones = x_t − w_t | se elige tras observar S_t |
| Exógena W_{t+1} | los 25 retornos del mes siguiente R_{t+1}, bootstrap en bloques de 3–6 meses históricos | desconocido en t |
| Transición S^M | W⁺_t = W_t(1 − c‖x_t − w_t‖₁), c = 10 pb; W_{t+1} = W⁺_t(1 + x_tᵀR_{t+1}); los pesos derivan; P_{t+1} = max(P_t, W_{t+1}) | |
| Objetivo | max_π E[ v(W_T / Ref − 1) ], T = 120 meses, Ref = riqueza inicial ($100,000), con la v del propio cliente | se evalúa en T |

También se reportan media, desviación estándar, P5/mediana/P95 de la riqueza final.

### 6. Políticas

| Política | Clase | Parámetros calibrables | Valor calibrado | Por qué este método |
|---|---|---|---|---|
| Comprar y mantener | Base | ninguno | — | lo más simple que puede hacer un asesor |
| Rebalanceo por bandas | PFA | ancho de banda b | b = 30% | regla transparente que el cliente puede seguir; un parámetro, calibrado por simulación |
| Re-solución anual del MILP | CFA | ventana L, multiplicador de CVaR θ | L = 120 m, θ = 1.25 | reutiliza la Parte 2 con la información disponible en cada fecha (sin ver el futuro) |
| Vendedor en pánico | Conductual | d, r (del cuestionario) | d = 25%, r = 20% | bandas + "a efectivo tras caída d, regresa tras recuperación r" |
| Perseguidor de rendimientos | Conductual | k, f (del cuestionario) | k = 25%, f = 3 m | bandas + cada f meses mueve k a los 3 mejores de 12 meses |
| Tú, sin asesoría | Conductual | d, r, k, f | igual | ambas capas |

Las políticas conductuales son capas sobre la política de bandas calibrada: con d = 100% y k = 0 la reproducen trayectoria por trayectoria (probado). Por eso cada dólar de diferencia es atribuible al comportamiento.

### 7. Protocolo de evaluación

- **Números aleatorios comunes:** una matriz de índices del bootstrap por corrida, compartida por todas las políticas; las comparaciones son pareadas.
- **Semillas separadas:** calibración en 300 escenarios (semilla 20241001), evaluación final en **500** escenarios (semilla 20242002), barridos de sensibilidad con su propia semilla. Una prueba verifica que no compartan trayectorias.
- **Se reportan:** media, desviación estándar, P5, mediana, P95 e intervalo de confianza al 95%.

### 8. Resultados ($100,000, 10 años, 500 escenarios de evaluación)

| Política | Clase | Media | Desv. | P5 | Mediana | P95 | Valor PT medio [IC 95%] |
|---|---|---:|---:|---:|---:|---:|---:|
| **Comprar y mantener** | Base | $387.4k | $178.7k | $176.9k | $352.5k | $687.4k | **2.263** [2.167, 2.359] |
| Rebalanceo por bandas | PFA | $386.5k | $170.9k | $176.9k | $352.5k | $681.3k | 2.258 [2.165, 2.352] |
| Re-solución anual del MILP | CFA | $380.8k | $189.9k | $153.4k | $343.5k | $712.7k | 2.204 [2.100, 2.309] |
| Vendedor en pánico | Conductual | $378.0k | $174.4k | $161.5k | $345.9k | $681.3k | 2.197 [2.101, 2.293] |
| Perseguidor de rendimientos | Conductual | $320.7k | $112.4k | $166.1k | $304.7k | $515.2k | 1.844 [1.778, 1.910] |
| Tú, sin asesoría | Conductual | $315.3k | $116.0k | $157.3k | $301.8k | $515.2k | 1.802 [1.733, 1.871] |

Diferencias pareadas en valor PT:
- comprar y mantener − bandas = 0.0043, IC 95% [−0.0036, 0.0123]: **no significativa**;
- comprar y mantener − CFA = 0.0584, IC 95% [0.0204, 0.0964]: **significativa**.

**Costo del comportamiento** (tendencias propias del cliente vs rebalanceo disciplinado por bandas, mismos escenarios):
- combinado: mediana **−$50.8k**, media −$71.1k, IC 95% [−$77.6k, −$64.7k];
- sólo pánico: mediana −$6.6k (se activa en 24% de las historias);
- sólo persecución: mediana −$47.8k.

### 9. Recomendación

**Mantener el portafolio MILP y rebalancear sólo con bandas amplias.** Comprar y mantener y el rebalanceo con bandas de 30% están estadísticamente empatados, y las bandas le dan al cliente una regla concreta. Ambas superan a la re-optimización anual, que agrega ruido de estimación y costos de operación sin agregar valor. Lo más valioso que puede hacer el asesor es **evitar que el cliente actúe según sus tendencias**: eso vale cerca de $51k de riqueza final mediana, más de cinco veces la diferencia de $9.1k entre la mejor y la peor estrategia disciplinada.

**Cuándo cambiaría la recomendación** (barridos de sensibilidad):
- *Baja aversión a pérdidas (λ ≤ 1.5):* bandas más estrechas (b = 15–20%) quedan ligeramente arriba, dentro del intervalo de confianza.
- *Costos de operación:* el orden se mantiene de 0 a 100 pb.
- *Meta más alta (punto de referencia con crecimiento de 0 a 8% anual):* el orden se mantiene.
- *La CFA nunca gana* en ningún barrido. Necesitaría un régimen donde los últimos 10 años informen sobre el siguiente, y estos datos no lo muestran.

### 10. Limitaciones

- Optimismo dentro de muestra: el MILP se ajusta con la misma historia que remuestrea el bootstrap, lo que favorece al portafolio estático y su inclinación a tecnología y oro. Una división walk-forward sería más estricta.
- El bootstrap en bloques sólo conserva memoria dentro de bloques de 3–6 meses, así que los ganadores de 12 meses tienen poca señal, lo que hace costosa la persecución de rendimientos. Tampoco genera crisis peores que las de la muestra.
- Los parámetros calibrados quedan en los bordes de la rejilla (b = 30%, L = 120, θ = 1.25): los datos dicen "opera menos".
- Con la referencia en la riqueza inicial, pocos escenarios terminan en pérdida, así que λ actúa sobre todo vía el tope de CVaR.
- Preferencias declaradas (no reveladas), sin ponderación de probabilidades, dos preguntas por parámetro; sin impuestos, aportaciones ni retiros.
