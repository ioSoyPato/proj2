# Timetable under uncertainty: course scheduling with MILP, re-optimization and RL

**[English](#english) · [Español](#español)**

---

## English

A Financial Engineering department has to publish its semester timetable **before** registration opens, and then live with whatever students actually do. This project builds that timetable with a mixed-integer program, then treats the six weeks of registration as a **sequential decision problem** (Warren Powell's framework): each week, a policy decides whether to open, merge or cancel sections, hire adjuncts (two-week lead time) or move sections to bigger rooms, while demand arrives and professors occasionally drop out. Four policies from different classes are compared on the **same 500 simulated registration periods**, and a bilingual FastAPI + React dashboard lets a department head explore the timetable, step through registration week by week, and re-run the comparison under their own assumptions.

> **Data are synthetic.** The assignment specifies data "provided by the course"; those files were not supplied, so `backend/app/data/generator.py` (seed `20260101`) generates an instance with exactly the specified shape: 25 courses (semesters 1/3/5/7), 37 sections in 6 cohorts, 14 full-time professors, 5 adjuncts, 10 rooms (3 labs), 14 meeting patterns, 5 years of enrollment history. Official files can be dropped in via `COURSE_DATA_DIR` (see [credentials](#credentialsenv)).

### Headline results

Final evaluation on 500 evaluation scenarios (seeds disjoint from training and tuning), common random numbers, US$ per semester:

| Policy | Class | Tuned params | Mean total cost | 95% CI | Std | P5 – P95 | Unserved students (mean) | Moved students (mean) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| **Weekly re-optimization (DLA)** | DLA | θ=0.9 | $140,618 | $137,558 – $143,678 | $34,909 | $117,509 – $206,963 | 11.6 | 27.8 |
| Q-learning (VFA/RL) | VFA | 15,000 ep. | $142,612 | $140,163 – $145,060 | $27,932 | $123,177 – $192,772 | 7.8 | 64.3 |
| Waitlist rule (PFA) | PFA | N=0, M=16 | $145,363 | $142,127 – $148,599 | $36,918 | $118,295 – $213,306 | 18.1 | 30.8 |
| Baseline (no changes) | Baseline | — | $271,295 | $261,390 – $281,200 | $113,002 | $132,090 – $463,246 | 133.7 | 6.6 |

Paired differences (same scenarios) against the best policy:

| Policy vs. Weekly re-optimization (DLA) | Extra cost (mean) | Paired 95% CI | Share of scenarios where it is cheaper |
|---|---:|---:|---:|
| Baseline (no changes) | $130,676 | $122,552 – $138,801 | 1% |
| Waitlist rule (PFA) | $4,745 | $3,577 – $5,913 | 22% |
| Q-learning (VFA/RL) | $1,993 | $97 – $3,889 | 24% |

**Recommendation: Weekly re-optimization (DLA).** It has the lowest expected semester cost, roughly halves the cost of doing nothing, solves each weekly model in about 7 ms, and its decisions read as a reviewable plan. **It would change** if the department prices an unserved student well above the base $1,200: then the learned Q-table, which leaves the fewest students without a seat by hiring adjuncts early as insurance, becomes cheaper (see [sensitivity](#sensitivity)). The waitlist rule and the baseline are dominated under every setting tested.

### Phase 1: the initial timetable

Binary `x[s,p,r,k]` = section *s* taught by professor *p* in room *r* with meeting pattern *k*. Hard constraints: each section exactly once; no professor, room or cohort twice in a block; qualified professors only, within load limits and availability; room capacity ≥ forecast enrollment; lab courses in labs. Objective: weighted count of violated preferences (professor's preferred patterns ×3, early/late blocks for semester-1/3 cohorts ×2, teaching outside primary courses ×1, lecture in a lab ×1, empty seats ×0.02).

The **forecast** is a damped linear trend on the 5 years of history (OLS, half the slope extrapolated); section forecast = ⌈course forecast / planned sections⌉. Backtest MAPE (predict 2025 from 2021–24): damped trend 8.8%, last-year naive 9.8%, 4-year mean 8.6%.

| Model | Solver that ran | Variables | Constraints | Objective | Gap | Time |
|---|---|---:|---:|---:|---:|---:|
| Monolithic x[s,p,r,k] | HiGHS (scipy.optimize.milp) | 7,887 | 428 | 13.42 | 0.00% | 0.83 s |
| Decomposed: stage A y[s,p,k] | Gurobi 14.0.0 (size-limited pip license) | 1,367 | 703 | 11.00 | 0.00% | 0.15 s |
| Decomposed: stage B z[s,r] | Gurobi 14.0.0 (size-limited pip license) | 215 | 98 | 2.66 | 0.00% | 0.13 s |

The monolithic model exceeds Gurobi's free 2,000-variable license, so it runs on **HiGHS**. A **decomposition** (Stage A: professor+pattern with aggregate room-capacity counting constraints; Stage B: rooms; no-good cuts if Stage B fails) fits the free license and runs on **Gurobi**. It reaches 13.66 vs. the optimal 13.42 because Stage A cannot see room costs. Both timetables pass an independent feasibility checker; the optimal one is published.

### Phase 2: the Powell model (summary)

| Element | Definition |
|---|---|
| **State** S_t | timetable (instructor/room/pattern/capacity/status per section), enrollment per section, waitlist per course with waiting times, adjuncts hired/pending (arrival week), remaining budget, professors still available, cumulative requests; belief: Gamma–Poisson posterior on each course's demand |
| **Decisions** x_t | open a section (FT professor with spare load or adjunct), hire an adjunct (usable after 2 weeks), cancel/merge an under-enrolled section (weeks ≥ 2), move a section to a larger room, re-staff or re-time an orphaned section |
| **Exogenous** W_{t+1} | new requests per course (Poisson total with correlated lognormal shock, ~68% in the first two weeks), drops, waitlist abandonment, professor unavailability (1%/prof/week) |
| **Transition** | seating rule (most free seats, FIFO waitlist), lead-time activation, budget update, orphan handling at term start |
| **Objective** | min E[ instructor ($2,800 FT share or adjunct pay per section) + rooms ($150 + $5/seat) + $600 per hire + $100 per room move + **$1,200 per unserved student** + **$200 per student moved after publication** ] subject to a $20,000 adjustment budget |

Every variable, unit and information assumption is written out on the dashboard's **The model** page (KaTeX).

### Policies

| Policy | Class | Tunable parameters | Why |
|---|---|---|---|
| Baseline | — | none | value of adjusting at all |
| Waitlist rule | **PFA** | N (open a section when waitlist > N), M (merge sections below M) | transparent rule a registrar can run by hand |
| Weekly re-optimization | **DLA** | θ (scales the forecast of remaining requests) | rolling-horizon MILP over the remaining weeks; executes only this week's decisions |
| Q-learning | **VFA** | trained Q-table (15,000 episodes) | per-course tabular Q over a 560-state abstraction, Monte-Carlo control; learns hedging the deterministic lookahead can't price |

N, M and θ are tuned by grid search on **tuning** seeds; the Q-table is trained on **training** seeds; everything is evaluated on separate **evaluation** seeds.

### Sensitivity

One factor at a time, 150 evaluation scenarios per setting, tuned parameters held fixed:

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

### Architecture

```
backend/                     FastAPI + pure Python (numpy, pandas, scipy, optional gurobipy)
  app/config.py              paths, seed families, credentials.env parser (never logs values)
  app/data/                  seeded generator, committed CSV/JSON instance, forecast
  app/phase1/                MILP builder (Gurobi | HiGHS), monolithic + decomposed models, independent checker
  app/simulator/             parameters, CRN scenario generator, registration environment (state, actions, transition, costs)
  app/policies/              baseline, waitlist rule (PFA), weekly re-optimization (DLA), Q-learning (VFA) + trained/q_table.json
  app/evaluation/            CRN evaluation, statistics, paired comparisons
  app/results/               precomputed phase1.json + evaluation.json (instant dashboard load)
  app/api/main.py            /api/health, /api/instance, /api/phase1, /api/results, POST /api/episode, POST /api/evaluate; serves the built frontend
  scripts/precompute.py      full pipeline; scripts/render_tables.py renders the doc tables from the JSON
  tests/                     pytest checks (feasibility, CRN, seeds, DLA execution, lead time, accounting)
frontend/                    React + TypeScript + Vite, Recharts, KaTeX; EN/ES, light/dark
docs/REPORT.md               bilingual report
Dockerfile                   node build → python:3.12-slim runtime, one process, one port
```

### How to run

**Docker (one command):**

```bash
docker build -t course-scheduling . && docker run -p 8003:8000 course-scheduling
# open http://localhost:8003
```

**Local development (two terminals):**

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.api.main:app --reload --port 8003

cd frontend
npm install && npm run dev          # http://localhost:5183 (talks to :8003 via frontend/.env)
```

**Reproduce everything / run tests:**

```bash
cd backend
.venv/bin/python -m scripts.precompute          # phase 1, RL training, tuning, 500-scenario evaluation, sensitivity (~10–15 min on 10 cores)
.venv/bin/python -m scripts.precompute --skip-train   # reuse the shipped Q-table
.venv/bin/pytest -q
```

#### credentials.env

The backend reads `../credentials.env` (one level above this folder; git-ignored) with a tiny parser and only ever reports whether a key is set:

- `GRB_LICENSE_FILE=` path to a Gurobi license. Optional. Without it, Gurobi's bundled size-limited license is used when a model fits (≤2,000 variables/constraints) and HiGHS otherwise.
- `COURSE_DATA_DIR=` folder with official course files using the same names/columns as `backend/app/data/files` (`true_mean_2026` is optional; without it the simulator uses the forecast as the true mean). Re-run `scripts.precompute` afterwards.

### Design decisions

- **Common random numbers at the student level.** A scenario pre-draws every student's course, arrival week, patience on the waitlist and drop time, plus each professor's dropout week. Policies only change decisions, so comparisons are paired and the pipeline verifies scenario hashes match.
- **Three disjoint seed families** (training 1,000,000+, tuning 2,000,000+, evaluation 9,000,000+), asserted by a test.
- **Policies never see the truth.** The generator's true mean demand drives the simulator; policies only see the history-based forecast and the requests observed so far.
- **The DLA executes only week-t decisions.** The lookahead MILP may plan openings and hires for later weeks; those are discarded and re-planned. A test wraps `decide()` to prove nothing planned for τ > t is executed.
- **Re-timing orphaned sections** was added after a first run showed that almost all remaining unserved students came from sections whose professor left and had no same-slot substitute (adjuncts only teach evenings).
- **Monte-Carlo targets for RL.** With many true states aliased into one table cell, one-step bootstrapping learned a passive policy; every-visit Monte-Carlo returns fixed it (in development runs on 60 tuning scenarios, mean cost dropped from ~$168k to ~$145k).

### Honest limitations

- Synthetic data; the penalty values ($1,200 per unserved student, $200 per moved student) are assumptions, which is why the sensitivity analysis matters.
- New overflow sections don't check cohort clashes (they're open to students of any cohort); students are assumed to fit them in.
- The DLA lookahead is deterministic (point forecast); it does not hedge professor dropouts. A stochastic lookahead or chance constraints would be the natural next step.
- The Q-table's state is coarse (it doesn't know course size) and was trained only under the base assumptions; under other assumptions it isn't retrained.
- DLA vs. RL is a close call: the paired difference is significant on 500 scenarios but small, and it flips under some sensitivity settings.
- The live endpoint runs fewer scenarios (default 40) and is labelled as such.

---

## Español

Un departamento de Ingeniería Financiera debe publicar su horario semestral **antes** de abrir inscripciones y luego vivir con lo que realmente hagan los alumnos. Este proyecto construye ese horario con un programa entero mixto y trata las seis semanas de inscripción como un **problema de decisión secuencial** (marco de Warren Powell): cada semana una política decide si abrir, fusionar o cancelar secciones, contratar adjuntos (dos semanas de anticipación) o mover secciones a salones más grandes, mientras llega la demanda y de vez en cuando un profesor se da de baja. Se comparan cuatro políticas de clases distintas sobre los **mismos 500 periodos de inscripción simulados**, y un tablero bilingüe FastAPI + React permite al jefe de departamento explorar el horario, recorrer las inscripciones semana a semana y volver a correr la comparación con sus propios supuestos.

> **Los datos son sintéticos.** La tarea especifica datos "proporcionados por el curso"; esos archivos no se entregaron, así que `backend/app/data/generator.py` (semilla `20260101`) genera una instancia con exactamente la forma pedida: 25 cursos (semestres 1/3/5/7), 37 secciones en 6 grupos, 14 profesores de tiempo completo, 5 adjuntos, 10 salones (3 laboratorios), 14 patrones de horario, 5 años de historial de inscripción. Los archivos oficiales pueden cargarse con `COURSE_DATA_DIR` (ver [credenciales](#credentialsenv-1)).

### Resultados principales

Evaluación final sobre 500 escenarios de evaluación (semillas ajenas a entrenamiento y calibración), números aleatorios comunes, US$ por semestre:

| Política | Clase | Parámetros | Costo total medio | IC 95% | Desv. est. | P5 – P95 | Alumnos sin lugar (media) | Alumnos cambiados (media) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| **Re-optimización semanal (DLA)** | DLA | θ=0.9 | $140,618 | $137,558 – $143,678 | $34,909 | $117,509 – $206,963 | 11.6 | 27.8 |
| Q-learning (VFA/RL) | VFA | 15,000 ep. | $142,612 | $140,163 – $145,060 | $27,932 | $123,177 – $192,772 | 7.8 | 64.3 |
| Regla de lista de espera (PFA) | PFA | N=0, M=16 | $145,363 | $142,127 – $148,599 | $36,918 | $118,295 – $213,306 | 18.1 | 30.8 |
| Base (sin cambios) | Baseline | — | $271,295 | $261,390 – $281,200 | $113,002 | $132,090 – $463,246 | 133.7 | 6.6 |

Diferencias pareadas (mismos escenarios) contra la mejor política:

| Política vs. Re-optimización semanal (DLA) | Costo extra (media) | IC 95% pareado | Escenarios en que es más barata |
|---|---:|---:|---:|
| Base (sin cambios) | $130,676 | $122,552 – $138,801 | 1% |
| Regla de lista de espera (PFA) | $4,745 | $3,577 – $5,913 | 22% |
| Q-learning (VFA/RL) | $1,993 | $97 – $3,889 | 24% |

**Recomendación: Re-optimización semanal (DLA).** Tiene el menor costo esperado del semestre, reduce aproximadamente a la mitad el costo de no hacer nada, resuelve cada modelo semanal en unos 7 ms y sus decisiones se leen como un plan revisable. **Cambiaría** si el departamento valora un alumno sin lugar muy por encima de los $1,200 base: entonces la tabla Q aprendida, que deja la menor cantidad de alumnos sin lugar porque contrata adjuntos temprano como seguro, resulta más barata (ver [sensibilidad](#sensibilidad)). La regla de lista de espera y la política base quedan dominadas en todos los escenarios probados.

### Fase 1: el horario inicial

Binaria `x[s,p,r,k]` = la sección *s* la imparte el profesor *p* en el salón *r* con el patrón *k*. Restricciones duras: cada sección exactamente una vez; ningún profesor, salón o grupo dos veces en un bloque; solo profesores habilitados, dentro de sus límites de carga y disponibilidad; capacidad del salón ≥ inscripción pronosticada; cursos con laboratorio en laboratorios. Objetivo: suma ponderada de preferencias violadas (patrones preferidos del profesor ×3, bloques extremos para grupos de semestre 1/3 ×2, impartir fuera de cursos principales ×1, curso teórico en laboratorio ×1, lugares vacíos ×0.02).

El **pronóstico** es una tendencia lineal amortiguada sobre los 5 años de historia (MCO, se extrapola la mitad de la pendiente); pronóstico por sección = ⌈pronóstico del curso / secciones planeadas⌉. MAPE en prueba retrospectiva (predecir 2025 con 2021–24): tendencia amortiguada 8.8%, ingenuo del último año 9.8%, media de 4 años 8.6%.

| Modelo | Solver usado | Variables | Restricciones | Objetivo | Gap | Tiempo |
|---|---|---:|---:|---:|---:|---:|
| Monolítico x[s,p,r,k] | HiGHS (scipy.optimize.milp) | 7,887 | 428 | 13.42 | 0.00% | 0.83 s |
| Descompuesto: etapa A y[s,p,k] | Gurobi 14.0.0 (size-limited pip license) | 1,367 | 703 | 11.00 | 0.00% | 0.15 s |
| Descompuesto: etapa B z[s,r] | Gurobi 14.0.0 (size-limited pip license) | 215 | 98 | 2.66 | 0.00% | 0.13 s |

El modelo monolítico excede la licencia gratuita de Gurobi de 2,000 variables, así que corre en **HiGHS**. Una **descomposición** (Etapa A: profesor+patrón con restricciones agregadas de conteo de capacidad de salones; Etapa B: salones; cortes no-good si falla la Etapa B) cabe en la licencia gratuita y corre en **Gurobi**. Llega a 13.66 contra el óptimo 13.42 porque la Etapa A no ve los costos de salón. Ambos horarios pasan un verificador de factibilidad independiente; se publica el óptimo.

### Fase 2: el modelo de Powell (resumen)

| Elemento | Definición |
|---|---|
| **Estado** S_t | horario (docente/salón/patrón/capacidad/estado por sección), inscritos por sección, lista de espera por curso con tiempos de espera, adjuntos contratados/pendientes (semana de llegada), presupuesto restante, profesores disponibles, solicitudes acumuladas; creencia: posterior Gamma–Poisson de la demanda de cada curso |
| **Decisiones** x_t | abrir sección (profesor de tiempo completo con carga libre o adjunto), contratar adjunto (disponible a las 2 semanas), cancelar/fusionar sección con baja inscripción (semanas ≥ 2), mover sección a un salón más grande, reasignar o reprogramar una sección huérfana |
| **Exógena** W_{t+1} | solicitudes nuevas por curso (total Poisson con choque lognormal correlacionado, ~68% en las dos primeras semanas), bajas, abandono de la lista de espera, indisponibilidad de profesores (1%/profesor/semana) |
| **Transición** | regla de asignación (más lugares libres, lista FIFO), activación con anticipación, actualización de presupuesto, manejo de huérfanas al inicio de clases |
| **Objetivo** | min E[ docentes ($2,800 por sección de tiempo completo o pago al adjunto) + salones ($150 + $5/lugar) + $600 por contratación + $100 por cambio de salón + **$1,200 por alumno sin lugar** + **$200 por alumno cambiado tras publicar** ] sujeto a un presupuesto de ajustes de $20,000 |

Cada variable, unidad y supuesto de información está escrito en la página **El modelo** del tablero (KaTeX).

### Políticas

| Política | Clase | Parámetros ajustables | Por qué |
|---|---|---|---|
| Base | — | ninguno | valor de ajustar |
| Regla de lista de espera | **PFA** | N (abrir sección si la espera > N), M (fusionar secciones con menos de M) | regla transparente que se puede aplicar a mano |
| Re-optimización semanal | **DLA** | θ (escala el pronóstico de solicitudes restantes) | MILP de horizonte rodante sobre las semanas restantes; ejecuta solo las decisiones de esta semana |
| Q-learning | **VFA** | tabla Q entrenada (15,000 episodios) | Q tabular por curso sobre una abstracción de 560 estados, control Monte Carlo; aprende coberturas que la anticipación determinista no valora |

N, M y θ se calibran por búsqueda en malla con semillas de **calibración**; la tabla Q se entrena con semillas de **entrenamiento**; todo se evalúa con semillas de **evaluación** distintas.

### Sensibilidad

Un factor a la vez, 150 escenarios de evaluación por escenario, parámetros calibrados fijos:

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

### Arquitectura

Ver el árbol en la sección en inglés: `backend/` (FastAPI + Python puro: `data`, `phase1`, `simulator`, `policies`, `evaluation`, `api`, `results`, `scripts`, `tests`), `frontend/` (React + TypeScript + Vite, Recharts, KaTeX, EN/ES, claro/oscuro), `docs/REPORT.md` y un `Dockerfile` de una sola imagen.

### Cómo correrlo

**Docker (un comando):**

```bash
docker build -t course-scheduling . && docker run -p 8003:8000 course-scheduling
# abrir http://localhost:8003
```

**Desarrollo local (dos terminales):**

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.api.main:app --reload --port 8003

cd frontend
npm install && npm run dev          # http://localhost:5183 (usa :8003 vía frontend/.env)
```

**Reproducir todo / correr pruebas:**

```bash
cd backend
.venv/bin/python -m scripts.precompute          # fase 1, entrenamiento RL, calibración, evaluación de 500 escenarios, sensibilidad (~10–15 min en 10 núcleos)
.venv/bin/python -m scripts.precompute --skip-train   # reutiliza la tabla Q incluida
.venv/bin/pytest -q
```

#### credentials.env

El backend lee `../credentials.env` (un nivel arriba de esta carpeta; ignorado por git) con un lector mínimo y solo informa si una clave está definida:

- `GRB_LICENSE_FILE=` ruta a una licencia de Gurobi. Opcional. Sin ella se usa la licencia limitada incluida cuando el modelo cabe (≤2,000 variables/restricciones) y HiGHS en otro caso.
- `COURSE_DATA_DIR=` carpeta con los archivos oficiales del curso con los mismos nombres/columnas que `backend/app/data/files` (`true_mean_2026` es opcional; sin ella el simulador usa el pronóstico como media real). Después vuelve a correr `scripts.precompute`.

### Decisiones de diseño

- **Números aleatorios comunes a nivel alumno.** Cada escenario pre-genera el curso, semana de llegada, paciencia en lista de espera y momento de baja de cada alumno, y la semana de baja de cada profesor. Las políticas solo cambian decisiones: las comparaciones son pareadas y el proceso verifica que los hashes de escenarios coincidan.
- **Tres familias de semillas ajenas** (entrenamiento 1,000,000+, calibración 2,000,000+, evaluación 9,000,000+), verificadas por una prueba.
- **Las políticas nunca ven la verdad.** La media real del generador mueve al simulador; las políticas solo ven el pronóstico histórico y las solicitudes observadas.
- **La DLA ejecuta solo las decisiones de la semana t.** El MILP puede planear aperturas y contrataciones posteriores; se descartan y se re-planean. Una prueba envuelve `decide()` para demostrar que nada planeado para τ > t se ejecuta.
- **Reprogramar secciones huérfanas** se agregó después de que una primera corrida mostró que casi todos los alumnos sin lugar venían de secciones cuyo profesor se fue y no tenían sustituto en ese horario (los adjuntos solo dan clase de noche).
- **Objetivos Monte Carlo para RL.** Con muchos estados reales agregados en una celda, el bootstrapping de un paso aprendía una política pasiva; los retornos Monte Carlo lo corrigieron (en corridas de desarrollo con 60 escenarios de calibración, el costo medio bajó de ~$168k a ~$145k).

### Limitaciones honestas

- Datos sintéticos; las penalizaciones ($1,200 por alumno sin lugar, $200 por alumno cambiado) son supuestos, por eso importa el análisis de sensibilidad.
- Las secciones nuevas de desborde no revisan empalmes de grupo (están abiertas a cualquier grupo); se supone que los alumnos las acomodan.
- La anticipación de la DLA es determinista (pronóstico puntual); no se cubre contra bajas de profesores. Una anticipación estocástica o restricciones probabilísticas serían el siguiente paso natural.
- El estado de la tabla Q es burdo (no conoce el tamaño del curso) y se entrenó solo con los supuestos base; con otros supuestos no se re-entrena.
- DLA contra RL es una decisión cerrada: la diferencia pareada es significativa en 500 escenarios pero pequeña, y se invierte en algunos escenarios de sensibilidad.
- El endpoint en vivo corre menos escenarios (40 por defecto) y así se indica.
