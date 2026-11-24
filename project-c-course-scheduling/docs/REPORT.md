# Report: course scheduling under uncertain enrollment

**[English](#english) · [Español](#español)**

All numbers below are generated from `backend/app/results/*.json` by `backend/scripts/render_tables.py`; the same results power the dashboard.

---

## English

### 1. Problem and client

The client is the head of a Financial Engineering department. Before registration opens she must publish a timetable (37 sections of 25 courses for 6 cohorts) assigning a professor, a room and a meeting pattern (two 2-hour sessions, Mon–Wed or Tue–Thu, same block, 07:00–21:00) to every section. During the six weeks of registration, requests arrive (most in the first two weeks), some courses overflow and others under-fill, and occasionally a professor becomes unavailable. Each week she can open sections, merge or cancel under-enrolled ones, hire adjuncts (effective two weeks later) or move sections to larger rooms.

**Data.** Synthetic, generated per the assignment specification by a seeded generator (seed 20260101), because the course-provided files were not supplied. The true mean demand of each course follows a trend; history (2021–2025) is drawn from it with noise. Policies see only the history-based forecast.

### 2. Phase 1: initial timetable (MILP)

*Model.* Binary x[s,p,r,k]; tuples violating qualification, availability, capacity ≥ forecast, or lab requirements are not generated. Constraints: each section once; one section per (professor, pattern), (room, pattern), (cohort, pattern); professor load between min and max hours. Objective: 3·[non-preferred pattern] + 2·[semester-1/3 section at 07:00 or 19:00] + 1·[non-primary course] + 1·[lecture in a lab] + 0.02·(empty seats vs. forecast).

*Forecast.* Damped linear trend: OLS on five annual points, extrapolating half the slope. Backtest MAPE on 2025: damped trend 8.8%, last-year naive 9.8%, 4-year mean 8.6%. Section forecast = ⌈course forecast / planned sections⌉.

*Solution.*

| Model | Solver that ran | Variables | Constraints | Objective | Gap | Time |
|---|---|---:|---:|---:|---:|---:|
| Monolithic x[s,p,r,k] | HiGHS (scipy.optimize.milp) | 7,887 | 428 | 13.42 | 0.00% | 0.83 s |
| Decomposed: stage A y[s,p,k] | Gurobi 14.0.0 (size-limited pip license) | 1,367 | 703 | 11.00 | 0.00% | 0.15 s |
| Decomposed: stage B z[s,r] | Gurobi 14.0.0 (size-limited pip license) | 215 | 98 | 2.66 | 0.00% | 0.13 s |

The monolithic model (HiGHS) is optimal with zero gap. The decomposition fits Gurobi's size-limited license and reaches 13.66 vs. 13.42; it is not optimal because Stage A ignores room costs. Violated preferences in the published timetable: 0 non-preferred patterns, 0 edge-block cohort sections, 11 non-primary course assignments, 0 lectures in labs, 121 empty seats in total. An independent checker (which re-implements every hard constraint without reusing the model code) finds zero violations in both timetables.

### 3. Phase 2: sequential decision model

**State** S_t (start of week t = 0..5; t = 6 is the start of classes): timetable with each section's instructor (full-time, adjunct or none), room, pattern, capacity, status and activation week; enrollment per section; waitlist per course with waiting times; adjunct hire and arrival weeks; remaining adjustment budget B_t; available professors; cumulative requests R_{c,t}. Belief: Λ_c ~ Gamma(α₀ + R_{c,t}, β₀ + π_t), prior mean = forecast, prior CV 0.25, π_t = expected share of requests already arrived.

**Decisions** x_t: open a section (course, instructor, free room, pattern); hire an adjunct; cancel or merge a section (weeks ≥ 2, only if its students fit elsewhere); move a section to a larger free room; re-staff an orphaned section at the same time or re-time it. Feasibility mirrors Phase 1 plus lead time and budget.

**Exogenous information** W_{t+1}: course demand D_c ~ Poisson(μ_c·m·exp(σε_c − σ²/2)), ε_c = √ρ·Z + √(1−ρ)·η_c (m = 1, σ = 0.2, ρ = 0.3); weekly split Dirichlet around (42, 26, 12, 9, 7, 4)%; waitlisted students give up w.p. 0.15/week; enrolled students drop w.p. 0.02/week; each professor becomes unavailable w.p. 0.01/week.

**Transition.** Requests go to the course's active section with most free seats, else the FIFO waitlist; adjunct sections activate at hire week + 2; budget decreases by fees and adjunct pay; at t = 6, orphaned sections without instructor are cancelled (students re-seated if possible, else unserved), remaining waitlists are unserved, empty sections are dropped.

**Objective.** Minimize expected semester cost = Σ running sections (FT $2,800 or adjunct $3,200–4,800; room $150 + $5/seat) + $600 per adjunct hired + $100 per room move + $1,200 × unserved students + $200 × students moved after publication, subject to the $20,000 budget.

### 4. Policies

- **Baseline:** keep the Phase-1 timetable.
- **Waitlist rule (PFA):** open capacity when waitlist > N (room upgrade first, then a new FT section, then an adjunct); merge sections below M from week 2; re-staff/re-time orphans. Tuned on 200 tuning scenarios over N ∈ {0,2,4,6,8,12,16}, M ∈ {0,5,8,12,16}: **N = 0, M = 16**.
- **Weekly re-optimization (DLA):** rolling-horizon MILP over weeks t..5 with flow constraints for seated/waiting students per course, candidate sections, hires with lead time, cancellations, room moves and orphan cover; point forecast scaled by θ; only τ = t decisions executed. Tuned on 100 tuning scenarios over θ ∈ {0.9, 1.0, 1.1, 1.2, 1.35}: **θ = 0.9**. Mean solve time 7 ms, largest model 610 variables, 100% of solves optimal.
- **Q-learning (VFA):** shared tabular Q over (week, waitlist bucket, demand–capacity gap bucket, orphan flag, merge flag) × 5 actions; every-visit Monte-Carlo control with ε-greedy exploration on 15,000 training scenarios (141 s); 164 of 560 states visited.

### 5. Evaluation

Same simulator, common random numbers (scenario hashes verified identical across policies), seeds: training 1000000–1014999, tuning 2000000–2000199, evaluation 9000000–9000499.

**Total cost (US$/semester), 500 scenarios:**

| Policy | Class | Tuned params | Mean total cost | 95% CI | Std | P5 – P95 | Unserved students (mean) | Moved students (mean) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| **Weekly re-optimization (DLA)** | DLA | θ=0.9 | $140,618 | $137,558 – $143,678 | $34,909 | $117,509 – $206,963 | 11.6 | 27.8 |
| Q-learning (VFA/RL) | VFA | 15,000 ep. | $142,612 | $140,163 – $145,060 | $27,932 | $123,177 – $192,772 | 7.8 | 64.3 |
| Waitlist rule (PFA) | PFA | N=0, M=16 | $145,363 | $142,127 – $148,599 | $36,918 | $118,295 – $213,306 | 18.1 | 30.8 |
| Baseline (no changes) | Baseline | — | $271,295 | $261,390 – $281,200 | $113,002 | $132,090 – $463,246 | 133.7 | 6.6 |

**Students without a seat:**

| Policy | Mean | 95% CI | Std | P5 | P95 |
|---|---:|---:|---:|---:|---:|
| Weekly re-optimization (DLA) | 11.6 | 9.2 – 14.0 | 27.7 | 0 | 66 |
| Q-learning (VFA/RL) | 7.8 | 6.1 – 9.5 | 19.6 | 0 | 43 |
| Waitlist rule (PFA) | 18.1 | 15.5 – 20.7 | 29.7 | 1 | 75 |
| Baseline (no changes) | 133.7 | 125.1 – 142.3 | 98.5 | 13 | 299 |

**Paired differences vs. the best policy:**

| Policy vs. Weekly re-optimization (DLA) | Extra cost (mean) | Paired 95% CI | Share of scenarios where it is cheaper |
|---|---:|---:|---:|
| Baseline (no changes) | $130,676 | $122,552 – $138,801 | 1% |
| Waitlist rule (PFA) | $4,745 | $3,577 – $5,913 | 22% |
| Q-learning (VFA/RL) | $1,993 | $97 – $3,889 | 24% |

### 6. Sensitivity analysis

150 evaluation scenarios per setting (the first 150 of the evaluation set), one factor at a time, tuned parameters fixed:

| Factor | Value | Baseline | PFA | DLA | RL | Best | Gap to runner-up (paired 95% CI) |
|---|---:|---:|---:|---:|---:|---|---:|
| Penalty per unserved student ($) | 400 | $166,746 | $131,977 | $131,768 | $136,833 | DLA (tie) | $209 ($-533 – $952) |
| Penalty per unserved student ($) | 800 | $223,058 | $140,718 | $139,063 | $139,911 | DLA (tie) | $848 ($-1,631 – $3,326) |
| Penalty per unserved student ($) | 1200 | $279,370 | $149,460 | $146,007 | $142,988 | RL (tie) | $3,019 ($-1,428 – $7,466) |
| Penalty per unserved student ($) | 2400 | $448,306 | $175,684 | $167,976 | $152,220 | RL | $15,756 ($5,261 – $26,251) |
| Demand multiplier | 0.85 | $193,359 | $129,706 | $126,515 | $132,030 | DLA | $3,190 ($1,529 – $4,851) |
| Demand multiplier | 1 | $279,370 | $149,460 | $146,007 | $142,988 | RL (tie) | $3,019 ($-1,428 – $7,466) |
| Demand multiplier | 1.15 | $387,468 | $171,406 | $160,299 | $162,478 | DLA (tie) | $2,180 ($-3,569 – $7,928) |
| Demand multiplier | 1.3 | $551,599 | $200,187 | $175,689 | $192,243 | DLA | $16,554 ($10,824 – $22,284) |
| Demand volatility σ | 0.1 | $250,457 | $145,230 | $142,366 | $141,643 | RL (tie) | $723 ($-2,843 – $4,289) |
| Demand volatility σ | 0.2 | $279,370 | $149,460 | $146,007 | $142,988 | RL (tie) | $3,019 ($-1,428 – $7,466) |
| Demand volatility σ | 0.35 | $338,565 | $155,254 | $143,718 | $153,623 | DLA | $9,905 ($6,755 – $13,054) |
| Weekly prof. unavailability prob. | 0 | $195,106 | $130,033 | $123,829 | $130,421 | DLA | $6,204 ($4,911 – $7,497) |
| Weekly prof. unavailability prob. | 0.01 | $279,370 | $149,460 | $146,007 | $142,988 | RL (tie) | $3,019 ($-1,428 – $7,466) |
| Weekly prof. unavailability prob. | 0.03 | $420,996 | $197,184 | $193,294 | $191,606 | RL (tie) | $1,688 ($-4,590 – $7,967) |
| Weekly prof. unavailability prob. | 0.05 | $552,890 | $268,562 | $260,545 | $263,674 | DLA (tie) | $3,130 ($-4,497 – $10,757) |
| Adjustment budget ($) | 0 | $279,370 | $161,372 | $157,854 | $158,003 | DLA (tie) | $149 ($-3,165 – $3,463) |
| Adjustment budget ($) | 8000 | $279,370 | $152,565 | $148,998 | $150,459 | DLA (tie) | $1,461 ($-2,527 – $5,449) |
| Adjustment budget ($) | 20000 | $279,370 | $149,460 | $146,007 | $142,988 | RL (tie) | $3,019 ($-1,428 – $7,466) |

### 7. Recommendation

Use the **Weekly re-optimization (DLA)**. On 500 evaluation scenarios it has the lowest mean semester cost ($140,618, 95% CI $137,558–$143,678), $130,676 less than keeping the published timetable and $4,745 less than the waitlist rule. Against the learned Q-table the paired gap is small ($1,993, CI $97 to $3,889), and on the 150-scenario sensitivity subset the base setting is a statistical tie. The practical arguments therefore matter: it moves fewer students after publication (27.8 vs. 64.3), needs no retraining when costs or rules change, solves in ~7 ms per week, and its output is a reviewable plan.

**When it would change.** If an unserved student is priced at $2,400 instead of $1,200, the Q-table wins clearly ($152,220 vs. $167,976), because it hedges against professor dropouts by hiring adjuncts early and leaves the fewest students without a seat (7.8 vs. 11.6 at base). The lookahead is significantly better when demand is well above or below forecast, when it is more volatile, and when no professor drops out; budget changes leave the two within noise (see the table above). The waitlist rule and the baseline are never the best choice.

### 8. Limitations

Synthetic data and assumed penalties; deterministic lookahead (no hedge against professor dropouts); coarse RL state trained only under base assumptions; overflow sections don't check cohort clashes; live dashboard runs use fewer scenarios.

---

## Español

### 1. Problema y cliente

La clienta es la jefa de un departamento de Ingeniería Financiera. Antes de abrir inscripciones debe publicar un horario (37 secciones de 25 cursos para 6 grupos) que asigne profesor, salón y patrón de horario (dos sesiones de 2 horas, Lun–Mié o Mar–Jue, mismo bloque, 07:00–21:00) a cada sección. Durante las seis semanas de inscripción llegan solicitudes (la mayoría en las dos primeras semanas), algunos cursos se desbordan y otros quedan cortos, y ocasionalmente un profesor queda indisponible. Cada semana puede abrir secciones, fusionar o cancelar las de baja inscripción, contratar adjuntos (efectivos dos semanas después) o mover secciones a salones más grandes.

**Datos.** Sintéticos, generados según la especificación de la tarea por un generador con semilla (20260101), porque los archivos del curso no se entregaron. La demanda media real de cada curso sigue una tendencia; la historia (2021–2025) se genera a partir de ella con ruido. Las políticas solo ven el pronóstico basado en la historia.

### 2. Fase 1: horario inicial (MILP)

*Modelo.* Binaria x[s,p,r,k]; no se generan tuplas que violen habilitación, disponibilidad, capacidad ≥ pronóstico o requisitos de laboratorio. Restricciones: cada sección una vez; una sección por (profesor, patrón), (salón, patrón), (grupo, patrón); carga del profesor entre sus horas mínimas y máximas. Objetivo: 3·[patrón no preferido] + 2·[sección de semestre 1/3 a las 07:00 o 19:00] + 1·[curso no principal] + 1·[curso teórico en laboratorio] + 0.02·(lugares vacíos vs. pronóstico).

*Pronóstico.* Tendencia lineal amortiguada: MCO sobre cinco puntos anuales, extrapolando la mitad de la pendiente. MAPE en prueba retrospectiva 2025: tendencia amortiguada 8.8%, ingenuo del último año 9.8%, media de 4 años 8.6%. Pronóstico por sección = ⌈pronóstico del curso / secciones planeadas⌉.

*Solución.*

| Modelo | Solver usado | Variables | Restricciones | Objetivo | Gap | Tiempo |
|---|---|---:|---:|---:|---:|---:|
| Monolítico x[s,p,r,k] | HiGHS (scipy.optimize.milp) | 7,887 | 428 | 13.42 | 0.00% | 0.83 s |
| Descompuesto: etapa A y[s,p,k] | Gurobi 14.0.0 (size-limited pip license) | 1,367 | 703 | 11.00 | 0.00% | 0.15 s |
| Descompuesto: etapa B z[s,r] | Gurobi 14.0.0 (size-limited pip license) | 215 | 98 | 2.66 | 0.00% | 0.13 s |

El modelo monolítico (HiGHS) es óptimo con gap cero. La descomposición cabe en la licencia limitada de Gurobi y llega a 13.66 contra 13.42; no es óptima porque la Etapa A ignora los costos de salón. Preferencias violadas en el horario publicado: 0 patrones no preferidos, 0 secciones de grupo en bloques extremos, 11 asignaciones fuera de cursos principales, 0 cursos teóricos en laboratorio, 121 lugares vacíos en total. Un verificador independiente (que re-implementa cada restricción dura sin reutilizar el código del modelo) encuentra cero violaciones en ambos horarios.

### 3. Fase 2: modelo de decisión secuencial

**Estado** S_t (inicio de la semana t = 0..5; t = 6 es el inicio de clases): horario con docente de cada sección (tiempo completo, adjunto o ninguno), salón, patrón, capacidad, estado y semana de activación; inscritos por sección; lista de espera por curso con tiempos de espera; semanas de contratación y llegada de adjuntos; presupuesto de ajustes B_t; profesores disponibles; solicitudes acumuladas R_{c,t}. Creencia: Λ_c ~ Gamma(α₀ + R_{c,t}, β₀ + π_t), media a priori = pronóstico, CV a priori 0.25.

**Decisiones** x_t: abrir sección (curso, docente, salón libre, patrón); contratar adjunto; cancelar o fusionar sección (semanas ≥ 2, solo si sus alumnos caben en otra); mover sección a un salón libre más grande; reasignar una sección huérfana en el mismo horario o reprogramarla. La factibilidad replica la Fase 1 más anticipación y presupuesto.

**Información exógena** W_{t+1}: demanda D_c ~ Poisson(μ_c·m·exp(σε_c − σ²/2)), ε_c = √ρ·Z + √(1−ρ)·η_c (m = 1, σ = 0.2, ρ = 0.3); reparto semanal Dirichlet alrededor de (42, 26, 12, 9, 7, 4)%; abandono de lista de espera 0.15/semana; bajas de inscritos 0.02/semana; cada profesor queda indisponible con prob. 0.01/semana.

**Transición.** Las solicitudes van a la sección activa del curso con más lugares libres, si no a la lista FIFO; las secciones de adjuntos se activan en la semana de contratación + 2; el presupuesto baja por cuotas y pagos a adjuntos; en t = 6 se cancelan las huérfanas sin docente (alumnos reubicados si se puede, si no sin lugar), las listas de espera restantes quedan sin lugar y se eliminan secciones vacías.

**Objetivo.** Minimizar el costo esperado del semestre = Σ secciones en operación (tiempo completo $2,800 o adjunto $3,200–4,800; salón $150 + $5/lugar) + $600 por adjunto contratado + $100 por cambio de salón + $1,200 × alumnos sin lugar + $200 × alumnos cambiados tras publicar, sujeto al presupuesto de $20,000.

### 4. Políticas

- **Base:** mantener el horario de la Fase 1.
- **Regla de lista de espera (PFA):** añadir capacidad si la espera > N (primero salón más grande, luego sección de tiempo completo, luego adjunto); fusionar secciones con menos de M desde la semana 2; reasignar/reprogramar huérfanas. Calibrada en 200 escenarios: **N = 0, M = 16**.
- **Re-optimización semanal (DLA):** MILP de horizonte rodante sobre las semanas t..5 con restricciones de flujo de alumnos inscritos/en espera por curso, secciones candidatas, contrataciones con anticipación, cancelaciones, cambios de salón y cobertura de huérfanas; pronóstico puntual escalado por θ; solo se ejecutan las decisiones τ = t. Calibrada en 100 escenarios: **θ = 0.9**. Tiempo medio de solución 7 ms, modelo más grande 610 variables, 100% de soluciones óptimas.
- **Q-learning (VFA):** Q tabular compartida sobre (semana, rango de espera, rango de brecha demanda–capacidad, huérfana, fusionable) × 5 acciones; control Monte Carlo de cada visita con exploración ε-greedy en 15,000 escenarios de entrenamiento (141 s); 164 de 560 estados visitados.

### 5. Evaluación

Mismo simulador, números aleatorios comunes (hashes de escenarios verificados idénticos entre políticas), semillas: entrenamiento 1000000–1014999, calibración 2000000–2000199, evaluación 9000000–9000499.

**Costo total (US$/semestre), 500 escenarios:**

| Política | Clase | Parámetros | Costo total medio | IC 95% | Desv. est. | P5 – P95 | Alumnos sin lugar (media) | Alumnos cambiados (media) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| **Re-optimización semanal (DLA)** | DLA | θ=0.9 | $140,618 | $137,558 – $143,678 | $34,909 | $117,509 – $206,963 | 11.6 | 27.8 |
| Q-learning (VFA/RL) | VFA | 15,000 ep. | $142,612 | $140,163 – $145,060 | $27,932 | $123,177 – $192,772 | 7.8 | 64.3 |
| Regla de lista de espera (PFA) | PFA | N=0, M=16 | $145,363 | $142,127 – $148,599 | $36,918 | $118,295 – $213,306 | 18.1 | 30.8 |
| Base (sin cambios) | Baseline | — | $271,295 | $261,390 – $281,200 | $113,002 | $132,090 – $463,246 | 133.7 | 6.6 |

**Alumnos sin lugar:**

| Política | Media | IC 95% | Desv. est. | P5 | P95 |
|---|---:|---:|---:|---:|---:|
| Re-optimización semanal (DLA) | 11.6 | 9.2 – 14.0 | 27.7 | 0 | 66 |
| Q-learning (VFA/RL) | 7.8 | 6.1 – 9.5 | 19.6 | 0 | 43 |
| Regla de lista de espera (PFA) | 18.1 | 15.5 – 20.7 | 29.7 | 1 | 75 |
| Base (sin cambios) | 133.7 | 125.1 – 142.3 | 98.5 | 13 | 299 |

**Diferencias pareadas contra la mejor política:**

| Política vs. Re-optimización semanal (DLA) | Costo extra (media) | IC 95% pareado | Escenarios en que es más barata |
|---|---:|---:|---:|
| Base (sin cambios) | $130,676 | $122,552 – $138,801 | 1% |
| Regla de lista de espera (PFA) | $4,745 | $3,577 – $5,913 | 22% |
| Q-learning (VFA/RL) | $1,993 | $97 – $3,889 | 24% |

### 6. Análisis de sensibilidad

150 escenarios de evaluación por escenario (los primeros 150 del conjunto de evaluación), un factor a la vez, parámetros calibrados fijos:

| Factor | Valor | Base | PFA | DLA | RL | Mejor | Ventaja sobre la segunda (IC 95% pareado) |
|---|---:|---:|---:|---:|---:|---|---:|
| Penalización por alumno sin lugar ($) | 400 | $166,746 | $131,977 | $131,768 | $136,833 | DLA (empate) | $209 ($-533 – $952) |
| Penalización por alumno sin lugar ($) | 800 | $223,058 | $140,718 | $139,063 | $139,911 | DLA (empate) | $848 ($-1,631 – $3,326) |
| Penalización por alumno sin lugar ($) | 1200 | $279,370 | $149,460 | $146,007 | $142,988 | RL (empate) | $3,019 ($-1,428 – $7,466) |
| Penalización por alumno sin lugar ($) | 2400 | $448,306 | $175,684 | $167,976 | $152,220 | RL | $15,756 ($5,261 – $26,251) |
| Multiplicador de demanda | 0.85 | $193,359 | $129,706 | $126,515 | $132,030 | DLA | $3,190 ($1,529 – $4,851) |
| Multiplicador de demanda | 1 | $279,370 | $149,460 | $146,007 | $142,988 | RL (empate) | $3,019 ($-1,428 – $7,466) |
| Multiplicador de demanda | 1.15 | $387,468 | $171,406 | $160,299 | $162,478 | DLA (empate) | $2,180 ($-3,569 – $7,928) |
| Multiplicador de demanda | 1.3 | $551,599 | $200,187 | $175,689 | $192,243 | DLA | $16,554 ($10,824 – $22,284) |
| Volatilidad de demanda σ | 0.1 | $250,457 | $145,230 | $142,366 | $141,643 | RL (empate) | $723 ($-2,843 – $4,289) |
| Volatilidad de demanda σ | 0.2 | $279,370 | $149,460 | $146,007 | $142,988 | RL (empate) | $3,019 ($-1,428 – $7,466) |
| Volatilidad de demanda σ | 0.35 | $338,565 | $155,254 | $143,718 | $153,623 | DLA | $9,905 ($6,755 – $13,054) |
| Prob. semanal de baja de profesor | 0 | $195,106 | $130,033 | $123,829 | $130,421 | DLA | $6,204 ($4,911 – $7,497) |
| Prob. semanal de baja de profesor | 0.01 | $279,370 | $149,460 | $146,007 | $142,988 | RL (empate) | $3,019 ($-1,428 – $7,466) |
| Prob. semanal de baja de profesor | 0.03 | $420,996 | $197,184 | $193,294 | $191,606 | RL (empate) | $1,688 ($-4,590 – $7,967) |
| Prob. semanal de baja de profesor | 0.05 | $552,890 | $268,562 | $260,545 | $263,674 | DLA (empate) | $3,130 ($-4,497 – $10,757) |
| Presupuesto de ajustes ($) | 0 | $279,370 | $161,372 | $157,854 | $158,003 | DLA (empate) | $149 ($-3,165 – $3,463) |
| Presupuesto de ajustes ($) | 8000 | $279,370 | $152,565 | $148,998 | $150,459 | DLA (empate) | $1,461 ($-2,527 – $5,449) |
| Presupuesto de ajustes ($) | 20000 | $279,370 | $149,460 | $146,007 | $142,988 | RL (empate) | $3,019 ($-1,428 – $7,466) |

### 7. Recomendación

Usar la **Re-optimización semanal (DLA)**. En 500 escenarios de evaluación tiene el menor costo medio del semestre ($140,618, IC 95% $137,558–$143,678), $130,676 menos que mantener el horario publicado y $4,745 menos que la regla de lista de espera. Frente a la tabla Q aprendida la diferencia pareada es pequeña ($1,993, IC $97 a $3,889), y en el subconjunto de 150 escenarios de sensibilidad el escenario base es un empate estadístico. Por eso pesan los argumentos prácticos: mueve menos alumnos tras publicar (27.8 vs. 64.3), no requiere re-entrenamiento cuando cambian costos o reglas, resuelve en ~7 ms por semana y su resultado es un plan revisable.

**Cuándo cambiaría.** Si un alumno sin lugar se valora en $2,400 en vez de $1,200, la tabla Q gana claramente ($152,220 vs. $167,976), porque se cubre contra bajas de profesores contratando adjuntos temprano y deja la menor cantidad de alumnos sin lugar (7.8 vs. 11.6 en la base). La anticipación es significativamente mejor cuando la demanda queda muy arriba o abajo del pronóstico, cuando es más volátil y cuando ningún profesor se va; los cambios de presupuesto dejan a ambas dentro del ruido (ver la tabla). La regla de lista de espera y la política base nunca son la mejor opción.

### 8. Limitaciones

Datos sintéticos y penalizaciones supuestas; anticipación determinista (sin cobertura contra bajas de profesores); estado de RL burdo y entrenado solo con supuestos base; las secciones de desborde no revisan empalmes de grupo; las corridas en vivo usan menos escenarios.
