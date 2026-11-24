# Sequential Decisions Lab

**[English](#english) | [Español](#español)**

Three decision-making problems for three different clients, each modeled with **Warren Powell's unified framework for sequential decisions**, solved with policies from different classes, evaluated on 500+ common-random-number scenarios, and presented in a bilingual interactive dashboard. All three live behind a single portal.

```bash
docker compose up --build        # → http://localhost:8000
```

---

<a id="english"></a>

## English

### The three projects

| | Project | Client | The question | Methods | Data |
|---|---|---|---|---|---|
| **A** | [Behavioral portfolio dashboard](project-a-behavioral-portfolio/) | Individual investor | How much does the client's own behavior cost them over 10 years? | Prospect-theory profiling · mean-CVaR **MILP** (Rockafellar–Uryasev) · block-bootstrap policy simulation | **Real**: 25 ETFs, 8 asset classes, 2008–2026 (`yfinance`) |
| **B** | [Dynamic ticket pricing](project-b-dynamic-pricing/) | Event promoter | What price should we post today to maximize revenue? | Pricing rule (PFA) · daily lookahead **MILP** (DLA) · Double DQN (RL) | **Real calibration**: 31 GB Kaggle *Flight Prices*, 26,858 flights |
| **C** | [Course scheduling](project-c-course-scheduling/) | Department head | How should the timetable adapt as registration comes in? | Timetable **MILP** · weekly re-optimization (DLA) · waitlist rule (PFA) · Q-learning (RL) | Synthetic, to the assignment's exact spec |

### Headline results

| | Recommended policy | Main result | 95% CI | Runner-up |
|---|---|---|---|---|
| **A** | Buy-and-hold the MILP portfolio (tied with band rebalancing, PFA) | The client's own tendencies cost **−$50.8k** median terminal wealth on $100k over 10 years, more than 5× the gap between the best and worst disciplined strategy | mean cost [−$77.6k, −$64.7k] | Band rebalancing (statistical tie) |
| **B** | Price-schedule rule (PFA): open at $100, drift +$20, react to booking pace | **$210.8k** mean revenue per event, **+9.0%** vs the best fixed price; beats it in 96% of scenarios | [$208.7k, $212.8k] | Daily lookahead MILP: $210.1k, sells out 89.5% vs 49.3% |
| **C** | Weekly re-optimization (DLA) | **$140.6k** mean semester cost, **48% cheaper** than keeping the published timetable; unserved students 134 → 11.6 | [$137.6k, $143.7k] | Q-learning: $142.6k, wins if an unseated student costs 2× more |

Each project's README and `docs/REPORT.md` give the full tables (mean, std, P5/P95, CI), the sensitivity analysis and the conditions under which the recommendation changes.

### What every project satisfies

1. **Powell model:** state, decision, exogenous information, transition and objective, with units and what is known at each decision. Rendered with KaTeX on each app's *Model* page.
2. **Policies:** a simple baseline plus at least two policy classes (PFA, CFA, VFA, DLA), each with its class, tunable parameters and justification.
3. **Evaluation:** one simulator per project, **common random numbers**, **separate seeds** for tuning and evaluation (verified by tests), **500+** final scenarios, and mean, spread and confidence intervals reported.
4. **Recommendation:** the policy to use, why, and when that would change, backed by sensitivity sweeps.
5. **Dashboard:** usable without reading code. The client changes the inputs, sees the recommended decision and reads the policy comparison in plain language, in English or Spanish.

### Architecture

Each project follows the same pattern: a **FastAPI** backend does all the computation and also serves a **React + TypeScript + Vite** frontend (Recharts, KaTeX) from one process on one port, packaged as one multi-stage Docker image. Heavy studies (≥500 scenarios, tuning, sensitivity sweeps) are precomputed into committed JSON so the dashboards load instantly. Live endpoints re-run the analysis on the user's own inputs.

> **About the dashboard technology.** The assignment suggests Streamlit. These projects use FastAPI + React instead, for a production-style separation of computation and presentation. Every dashboard requirement (change inputs, see the recommended decision, compare policies in plain language, run with one command) is met.

```
proj2/
├── docker-compose.yml          the whole lab: 3 apps + portal
├── run-all.sh                  the same, without Docker
├── credentials.env             your keys (git-ignored), see below
├── portal/index.html           one UI: overview + tabs embedding the three apps
├── project-a-behavioral-portfolio/   backend/ frontend/ Dockerfile README.md docs/REPORT.md
├── project-b-dynamic-pricing/        backend/ frontend/ Dockerfile README.md docs/REPORT.md
└── project-c-course-scheduling/      backend/ frontend/ Dockerfile README.md docs/REPORT.md
```

Solvers: **Gurobi** (the pip package's size-limited licence, or yours via `GRB_LICENSE_FILE`), falling back automatically to **HiGHS**. Each app shows which solver ran.

### How to run

**Everything, with Docker (recommended):**

```bash
docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:8000 | **Portal**: all three apps in one UI |
| http://localhost:8001 | A: Behavioral portfolio |
| http://localhost:8002 | B: Dynamic ticket pricing |
| http://localhost:8003 | C: Course scheduling |

**Everything, without Docker:** build each project once (`backend/.venv` + `npm run build`; see each README), then run `./run-all.sh`.

**One project alone:** `cd project-x && docker build -t x . && docker run -p 800N:8000 x`.

### credentials.env

Copy the keys you have into `credentials.env` at this level. It is git-ignored and never printed. Everything runs without it; the committed results were produced with real data.

| Key | Used by | Without it |
|---|---|---|
| `KAGGLE_API_TOKEN` (or `KAGGLE_USERNAME` + `KAGGLE_KEY`) | B: re-running the calibration from Kaggle | committed calibration is used |
| `FLIGHT_PRICES_CSV` | B: calibrating from a local copy instead | — |
| `GRB_LICENSE_FILE` | A, B, C: full Gurobi licence | size-limited Gurobi, else HiGHS |
| `COURSE_DATA_DIR` | C: official course data files, if provided | synthetic instance |

### Honest limitations (details in each report)

- **A:** in-sample optimism (the MILP is fit on the history the bootstrap resamples); the bootstrap has little medium-term momentum.
- **B:** flights stand in for concerts (only the curve's shape transfers); the RL agent underperforms the fixed price after a single time-boxed training run; 600 evaluation scenarios.
- **C:** synthetic data; the sensitivity sweep uses 150 scenarios per point; DLA beats Q-learning only narrowly.

---

<a id="español"></a>

## Español

Tres problemas de decisión para tres clientes distintos, cada uno modelado con el **marco unificado de decisiones secuenciales de Warren Powell**, resuelto con políticas de distintas clases, evaluado en más de 500 escenarios con números aleatorios comunes y presentado en un tablero interactivo bilingüe. Los tres viven detrás de un solo portal.

```bash
docker compose up --build        # → http://localhost:8000
```

### Los tres proyectos

| | Proyecto | Cliente | La pregunta | Métodos | Datos |
|---|---|---|---|---|---|
| **A** | [Tablero de portafolio conductual](project-a-behavioral-portfolio/) | Inversionista individual | ¿Cuánto le cuesta al cliente su propio comportamiento en 10 años? | Perfil por teoría prospectiva · **MILP** media-CVaR (Rockafellar–Uryasev) · simulación de políticas con block bootstrap | **Reales**: 25 ETF, 8 clases de activo, 2008–2026 (`yfinance`) |
| **B** | [Precios dinámicos de boletos](project-b-dynamic-pricing/) | Promotor de eventos | ¿Qué precio publicar hoy para maximizar el ingreso? | Regla de precios (PFA) · **MILP** de lookahead diario (DLA) · Double DQN (RL) | **Calibración real**: 31 GB de *Flight Prices* de Kaggle, 26,858 vuelos |
| **C** | [Horarios universitarios](project-c-course-scheduling/) | Jefe de departamento | ¿Cómo adaptar el horario conforme llegan las inscripciones? | **MILP** de horario · re-optimización semanal (DLA) · regla de lista de espera (PFA) · Q-learning (RL) | Sintéticos, con la especificación exacta de la tarea |

### Resultados principales

| | Política recomendada | Resultado principal | IC 95% | Segunda opción |
|---|---|---|---|---|
| **A** | Comprar y mantener el portafolio MILP (empatada con rebalanceo por bandas, PFA) | Las tendencias propias del cliente cuestan **−$50.8k** de riqueza final mediana sobre $100k en 10 años, más de 5× la diferencia entre la mejor y la peor estrategia disciplinada | costo medio [−$77.6k, −$64.7k] | Rebalanceo por bandas (empate estadístico) |
| **B** | Regla de calendario (PFA): abrir en $100, subir +$20, reaccionar al ritmo de ventas | **$210.8k** de ingreso medio por evento, **+9.0%** vs el mejor precio fijo; lo supera en 96% de los escenarios | [$208.7k, $212.8k] | Lookahead diario MILP: $210.1k, agota 89.5% vs 49.3% |
| **C** | Re-optimización semanal (DLA) | **$140.6k** de costo medio por semestre, **48% más barato** que mantener el horario publicado; alumnos sin lugar 134 → 11.6 | [$137.6k, $143.7k] | Q-learning: $142.6k, gana si un alumno sin lugar cuesta el doble |

El README y el `docs/REPORT.md` de cada proyecto tienen las tablas completas (media, desv., P5/P95, IC), el análisis de sensibilidad y las condiciones bajo las que cambia la recomendación.

### Qué cumple cada proyecto

1. **Modelo de Powell:** estado, decisión, información exógena, transición y objetivo, con unidades y lo que se conoce en cada decisión. En KaTeX en la página *Modelo* de cada app.
2. **Políticas:** una línea base simple más al menos dos clases de política (PFA, CFA, VFA, DLA), cada una con su clase, parámetros calibrables y justificación.
3. **Evaluación:** un simulador por proyecto, **números aleatorios comunes**, **semillas separadas** para calibración y evaluación (verificado con pruebas), **500+** escenarios finales, y se reportan media, dispersión e intervalos de confianza.
4. **Recomendación:** qué política usar, por qué y cuándo cambiaría, con barridos de sensibilidad.
5. **Tablero:** usable sin leer código. El cliente cambia los insumos, ve la decisión recomendada y lee la comparación de políticas en lenguaje claro, en inglés o español.

### Arquitectura

Cada proyecto sigue el mismo patrón: un backend **FastAPI** hace todo el cómputo y además sirve un frontend **React + TypeScript + Vite** (Recharts, KaTeX) desde un solo proceso y un solo puerto, empaquetado en una imagen Docker multi-etapa. Los estudios pesados (≥500 escenarios, calibración, sensibilidad) se precalculan en JSON incluidos en el repositorio para que los tableros carguen al instante. Los endpoints en vivo recalculan con los insumos del usuario.

> **Sobre la tecnología del tablero.** La tarea sugiere Streamlit. Estos proyectos usan FastAPI + React para separar cómputo y presentación como en producción. Se cumplen todos los requisitos del tablero: cambiar insumos, ver la decisión recomendada, comparar políticas en lenguaje claro y correr con un solo comando.

```
proj2/
├── docker-compose.yml          todo el laboratorio: 3 apps + portal
├── run-all.sh                  lo mismo, sin Docker
├── credentials.env             tus llaves (ignorado por git), ver abajo
├── portal/index.html           una sola UI: resumen + pestañas con las tres apps
├── project-a-behavioral-portfolio/   backend/ frontend/ Dockerfile README.md docs/REPORT.md
├── project-b-dynamic-pricing/        backend/ frontend/ Dockerfile README.md docs/REPORT.md
└── project-c-course-scheduling/      backend/ frontend/ Dockerfile README.md docs/REPORT.md
```

Solvers: **Gurobi** (licencia limitada del paquete pip, o la tuya vía `GRB_LICENSE_FILE`), con respaldo automático a **HiGHS**. Cada app muestra qué solver se usó.

### Cómo correrlo

**Todo, con Docker (recomendado):**

```bash
docker compose up --build
```

| URL | Qué |
|---|---|
| http://localhost:8000 | **Portal**: las tres apps en una sola UI |
| http://localhost:8001 | A: Portafolio conductual |
| http://localhost:8002 | B: Precios dinámicos de boletos |
| http://localhost:8003 | C: Horarios universitarios |

**Todo, sin Docker:** compila cada proyecto una vez (`backend/.venv` + `npm run build`; ver cada README) y corre `./run-all.sh`.

**Un solo proyecto:** `cd project-x && docker build -t x . && docker run -p 800N:8000 x`.

### credentials.env

Pon las llaves que tengas en `credentials.env` en este nivel. Está ignorado por git y nunca se imprime. Todo corre sin él; los resultados incluidos se generaron con datos reales.

| Llave | La usa | Sin ella |
|---|---|---|
| `KAGGLE_API_TOKEN` (o `KAGGLE_USERNAME` + `KAGGLE_KEY`) | B: volver a calibrar desde Kaggle | se usa la calibración incluida |
| `FLIGHT_PRICES_CSV` | B: calibrar desde una copia local | — |
| `GRB_LICENSE_FILE` | A, B, C: licencia completa de Gurobi | Gurobi limitado, si no HiGHS |
| `COURSE_DATA_DIR` | C: archivos oficiales del curso, si se entregan | instancia sintética |

### Limitaciones honestas (detalle en cada reporte)

- **A:** optimismo dentro de muestra (el MILP se ajusta con la historia que remuestrea el bootstrap); el bootstrap casi no tiene momentum de mediano plazo.
- **B:** los vuelos sustituyen a conciertos (sólo se transfiere la forma de la curva); el agente RL rinde menos que el precio fijo tras un solo entrenamiento con tiempo limitado; 600 escenarios de evaluación.
- **C:** datos sintéticos; el barrido de sensibilidad usa 150 escenarios por punto; el DLA supera a Q-learning por poco.
