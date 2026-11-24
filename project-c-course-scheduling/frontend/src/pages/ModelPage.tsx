import { Eq, M } from "../components/Eq";
import { ErrorBox, Loading, PageHead } from "../components/ui";
import { useInstance } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import { money, pct } from "../lib/format";

const r = String.raw;

export function ModelPage() {
  const { t, d, lang } = useI18n();
  const { data: inst, error } = useInstance();
  if (error) return <ErrorBox error={error} />;
  if (!inst) return <Loading />;
  const c = inst.params.settings.cost, s = inst.params.settings.scen;
  const prof = inst.params.arrival_profile;

  return (
    <>
      <PageHead title={d("nav.model")} lede={t("Two problems that share one timetable: a static assignment solved once before registration, and a sequential decision problem solved every week during registration.", "Dos problemas que comparten un horario: una asignación estática que se resuelve una vez antes de las inscripciones, y un problema de decisión secuencial que se resuelve cada semana durante las inscripciones.")} />

      <h2>{t("Phase 1: the initial timetable (MILP)", "Fase 1: el horario inicial (MILP)")}</h2>
      <div className="prose">
        <p>{t("Sets: sections ", "Conjuntos: secciones ")}<M>{r`s\in\mathcal S`}</M> (37), {t("full-time professors ", "profesores de tiempo completo ")}<M>{r`p\in\mathcal P`}</M> (14), {t("rooms ", "salones ")}<M>{r`r\in\mathcal R`}</M> (10), {t("meeting patterns ", "patrones de horario ")}<M>{r`k\in\mathcal K`}</M> (14 = {t("Mon–Wed or Tue–Thu × seven 2-hour blocks from 7:00 to 21:00", "Lun–Mié o Mar–Jue × siete bloques de 2 horas de 7:00 a 21:00")}), {t("cohorts ", "grupos ")}<M>{r`g\in\mathcal G`}</M> (6). {t("Section ", "La sección ")}<M>s</M> {t("belongs to course ", "pertenece al curso ")}<M>{r`c(s)`}</M> {t("and cohort ", "y al grupo ")}<M>{r`g(s)`}</M>.</p>
        <p>{t("Decision: ", "Decisión: ")}<M>{r`x_{s,p,r,k}=1`}</M> {t("if section s is taught by professor p in room r with pattern k. Tuples that break a hard rule are never created (equivalent to fixing them to zero):", "si la sección s la imparte el profesor p en el salón r con el patrón k. Las tuplas que violan una regla dura nunca se crean (equivale a fijarlas en cero):")}</p>
      </div>
      <Eq>{r`\mathcal F=\{(s,p,r,k):\; c(s)\in Q_p,\;\; k\notin U_p,\;\; \text{cap}_r\ge f_s,\;\; \text{lab}_{c(s)}\Rightarrow \text{lab}_r\}`}</Eq>
      <div className="prose"><p><M>{r`Q_p`}</M> {t("qualified courses, ", "cursos habilitados, ")}<M>{r`U_p`}</M> {t("unavailable patterns, ", "patrones no disponibles, ")}<M>{r`\text{cap}_r`}</M> {t("seats, ", "lugares, ")}<M>{r`f_s=\lceil F_{c(s)}/n_{c(s)}\rceil`}</M> {t("forecast students per section (see The data).", "alumnos pronosticados por sección (ver Los datos).")}</p></div>
      <Eq>{r`\min_{x}\;\sum_{(s,p,r,k)\in\mathcal F} w_{s,p,r,k}\,x_{s,p,r,k}`}</Eq>
      <Eq>{r`\begin{aligned}
\textstyle\sum_{p,r,k} x_{s,p,r,k} &= 1 && \forall s \quad\text{(every section exactly once)}\\
\textstyle\sum_{s,r} x_{s,p,r,k} &\le 1 && \forall p,k \quad\text{(no professor twice in a block)}\\
\textstyle\sum_{s,p} x_{s,p,r,k} &\le 1 && \forall r,k \quad\text{(no room twice in a block)}\\
\textstyle\sum_{s:\,g(s)=g}\sum_{p,r} x_{s,p,r,k} &\le 1 && \forall g,k \quad\text{(a cohort's sections never overlap)}\\
L_p \le \textstyle\sum_{s,r,k} x_{s,p,r,k} &\le H_p && \forall p \quad\text{(load limits, in sections of 4 h)}
\end{aligned}`}</Eq>
      <div className="prose"><p>{t("The objective is the weighted count of violated soft preferences:", "El objetivo es la suma ponderada de preferencias suaves violadas:")}</p></div>
      <Eq>{r`w_{s,p,r,k}=3\,\mathbb 1[k\notin \text{Pref}_p]+2\,\mathbb 1[\text{sem}_{c(s)}\le 3,\ \text{block}_k\in\{7{:}00,19{:}00\}]+1\,\mathbb 1[c(s)\notin \text{Prim}_p]+1\,\mathbb 1[\text{lab}_r\wedge\neg\text{lab}_{c(s)}]+0.02\,(\text{cap}_r-f_s)`}</Eq>
      <div className="prose">
        <p>{t("Professor's preferred patterns, early or late blocks for first- and third-semester cohorts, teaching outside one's primary courses, a lecture course occupying a computer lab, and empty seats.", "Patrones preferidos del profesor, bloques muy temprano o muy tarde para los grupos de primer y tercer semestre, impartir fuera de los cursos principales, un curso teórico ocupando un laboratorio y lugares vacíos.")}</p>
        <p><strong>{t("Size and decomposition. ", "Tamaño y descomposición. ")}</strong>{t("After filtering, the monolithic model has about 7,900 binaries. That exceeds the 2,000-variable limit of Gurobi's free pip license, so it is solved with HiGHS. A decomposed version is also solved: Stage A chooses professor and pattern y[s,p,k] (about 1,400 binaries, with aggregate room-capacity counting constraints per pattern); Stage B assigns rooms given the patterns. If Stage B is infeasible for some pattern, a no-good cut on that pattern's set of sections is added to Stage A (logic-based Benders). Each stage fits Gurobi's free license. The decomposition can lose optimality because Stage A ignores room costs. Both results are on the Initial timetable page.",
          "Tras el filtrado, el modelo monolítico tiene unas 7,900 binarias. Eso supera el límite de 2,000 variables de la licencia gratuita de Gurobi por pip, así que se resuelve con HiGHS. También se resuelve una versión descompuesta: la Etapa A elige profesor y patrón y[s,p,k] (unas 1,400 binarias, con restricciones agregadas de conteo de capacidad de salones por patrón); la Etapa B asigna salones dados los patrones. Si la Etapa B es infactible para algún patrón, se agrega a la Etapa A un corte no-good sobre ese conjunto de secciones (Benders lógico). Cada etapa cabe en la licencia gratuita de Gurobi. La descomposición puede perder optimalidad porque la Etapa A ignora los costos de salón. Ambos resultados están en la página Horario inicial.")}</p>
      </div>

      <hr className="rule" />
      <h2>{t("Phase 2: registration as a sequential decision problem", "Fase 2: las inscripciones como problema de decisión secuencial")}</h2>
      <div className="prose"><p>{t("Decision epochs are the start of each registration week, ", "Las épocas de decisión son el inicio de cada semana de inscripción, ")}<M>{r`t=0,1,\dots,5`}</M>{t(", plus ", ", más ")}<M>{r`t=6`}</M>{t(" when classes start (only re-staffing allowed). Money is in US dollars per semester; quantities of students are headcounts.", " cuando empiezan las clases (solo se permite reasignar docentes). El dinero está en dólares por semestre; los estudiantes se cuentan por persona.")}</p></div>

      <h3>{t("1. State: what is known when the decision is made", "1. Estado: lo que se sabe al decidir")}</h3>
      <Eq>{r`S_t=\big(\mathcal T_t,\; (n_{s,t})_s,\; (w_{c,t},\,a_{c,t})_c,\; (h_a,\,\alpha_a)_a,\; B_t,\; \mathcal P_t,\; (R_{c,t})_c\big)`}</Eq>
      <ul className="prose">
        <li><M>{r`\mathcal T_t`}</M>: {t("current timetable; each section has course, instructor (full-time, adjunct, or none if orphaned), room, pattern, capacity (seats), status (active / planned) and activation week.", "horario actual; cada sección tiene curso, docente (tiempo completo, adjunto o ninguno si quedó huérfana), salón, patrón, capacidad (lugares), estado (activa / planeada) y semana de activación.")}</li>
        <li><M>{r`n_{s,t}`}</M>: {t("students enrolled in section s; ", "alumnos inscritos en la sección s; ")}<M>{r`w_{c,t}`}</M>: {t("waitlist of course c, with each student's waiting time ", "lista de espera del curso c, con el tiempo de espera de cada alumno ")}<M>{r`a_{c,t}`}</M>.</li>
        <li><M>{r`h_a`}</M>: {t("week adjunct a was hired (or none); ", "semana en que se contrató al adjunto a (o ninguna); ")}<M>{r`\alpha_a=h_a+2`}</M>: {t("week the adjunct can start teaching (2-week lead time).", "semana en que el adjunto puede empezar a dar clase (2 semanas de anticipación).")}</li>
        <li><M>{r`B_t`}</M>: {t(`remaining adjustment budget in $ (starts at ${money(c.budget, lang)}; pays adjunct fees and adjunct per-section pay).`, `presupuesto de ajustes restante en $ (inicia en ${money(c.budget, lang)}; paga cuotas y sueldos por sección de adjuntos).`)}</li>
        <li><M>{r`\mathcal P_t`}</M>: {t("professors still available; ", "profesores aún disponibles; ")}<M>{r`R_{c,t}`}</M>: {t("cumulative registration requests observed so far.", "solicitudes de inscripción acumuladas observadas hasta ahora.")}</li>
        <li>{t("Belief state: course demand rate ", "Estado de creencia: tasa de demanda del curso ")}<M>{r`\Lambda_c\sim\text{Gamma}(\alpha_0+R_{c,t},\;\beta_0+\pi_t)`}</M>{t(", prior mean = the Phase-1 forecast, prior CV 0.25, ", ", media a priori = el pronóstico de la Fase 1, CV a priori 0.25, ")}<M>{r`\pi_t=\sum_{u<t}p_u`}</M>{t(" the expected share of requests already arrived.", " la fracción esperada de solicitudes ya llegadas.")}</li>
      </ul>

      <h3>{t("2. Decisions", "2. Decisiones")}</h3>
      <Eq>{r`x_t=\big(o_{c,i,r,k},\; y_a,\; z_s,\; \mu_{s\to s'},\; m_{s,r},\; g_{s,i,r,k}\big)\in\mathcal X(S_t)`}</Eq>
      <ul className="prose">
        <li><M>{r`o`}</M>: {t("open a new section of course c with instructor i (full-time professor with spare load, or an adjunct already hired) in a free room r at pattern k. An adjunct's section seats students only from week ", "abrir una sección nueva del curso c con docente i (profesor de tiempo completo con carga libre, o un adjunto ya contratado) en un salón libre r con patrón k. La sección de un adjunto recibe alumnos solo desde la semana ")}<M>{r`\max(t,\alpha_a)\le 5`}</M>.</li>
        <li><M>{r`y_a`}</M>: {t(`hire adjunct a (fee ${money(c.adjunct_hire_fee, lang)}).`, `contratar al adjunto a (cuota ${money(c.adjunct_hire_fee, lang)}).`)}</li>
        <li><M>{r`z_s,\ \mu_{s\to s'}`}</M>: {t("cancel an under-enrolled section, or merge it into a sibling section of the same course. Allowed from week 2 only, and only if all its students fit in the remaining sections.", "cancelar una sección con baja inscripción o fusionarla con otra sección del mismo curso. Solo a partir de la semana 2 y solo si todos sus alumnos caben en las secciones restantes.")}</li>
        <li><M>{r`m_{s,r}`}</M>: {t("move a section to a larger free room at the same time.", "mover una sección a un salón libre más grande a la misma hora.")}</li>
        <li><M>{r`g`}</M>: {t("re-staff a section whose professor became unavailable: same time with a substitute, or re-time it (new instructor, room and pattern; its students count as moved).", "reasignar una sección cuyo profesor quedó indisponible: a la misma hora con un sustituto, o cambiándola de horario (nuevo docente, salón y patrón; sus alumnos cuentan como cambiados).")}</li>
      </ul>
      <p className="prose">{t("Feasibility is the Phase-1 rule set applied to the changes: qualification, availability, no double booking of professors, adjuncts or rooms, load limits, lab rooms, the lead time and the budget.", "La factibilidad es el mismo conjunto de reglas de la Fase 1 aplicado a los cambios: habilitación, disponibilidad, sin empalmes de profesores, adjuntos o salones, límites de carga, laboratorios, la anticipación y el presupuesto.")}</p>

      <h3>{t("3. Exogenous information", "3. Información exógena")}</h3>
      <Eq>{r`W_{t+1}=\big(A_{c,t+1},\; \text{drops},\; \text{reneges},\; \mathcal P_t\setminus\mathcal P_{t+1}\big)`}</Eq>
      <ul className="prose">
        <li>{t("New requests ", "Solicitudes nuevas ")}<M>{r`A_{c,t+1}`}</M>{t(" arriving during week t. Total demand ", " que llegan durante la semana t. Demanda total ")}<M>{r`D_c\sim\text{Poisson}(\lambda_c),\ \lambda_c=\mu_c\, m\, e^{\sigma\varepsilon_c-\sigma^2/2},\ \varepsilon_c=\sqrt{\rho}\,Z+\sqrt{1-\rho}\,\eta_c`}</M>{t(` with demand multiplier m = ${s.demand_multiplier}, volatility σ = ${s.demand_volatility}, common share ρ = ${s.common_share}. Weekly split: Dirichlet around (${prof.map((x) => pct(x, lang)).join(", ")}). Most requests come in the first two weeks.`, ` con multiplicador de demanda m = ${s.demand_multiplier}, volatilidad σ = ${s.demand_volatility}, fracción común ρ = ${s.common_share}. Reparto semanal: Dirichlet alrededor de (${prof.map((x) => pct(x, lang)).join(", ")}). La mayoría llega en las dos primeras semanas.`)}</li>
        <li>{t(`Each waitlisted student gives up with probability ${s.renege_prob} per week waited; each enrolled student drops with probability ${s.drop_prob} per week.`, `Cada alumno en lista de espera se rinde con probabilidad ${s.renege_prob} por semana de espera; cada inscrito se da de baja con probabilidad ${s.drop_prob} por semana.`)}</li>
        <li>{t(`Each professor becomes unavailable for the semester with probability q = ${s.unavailability_prob} per week; their sections become orphaned.`, `Cada profesor queda indisponible el resto del semestre con probabilidad q = ${s.unavailability_prob} por semana; sus secciones quedan huérfanas.`)}</li>
        <li><M>{r`\mu_c`}</M>{t(" is the generator's true mean, which no policy observes; policies only know the history-based forecast.", " es la media verdadera del generador, que ninguna política observa; las políticas solo conocen el pronóstico basado en historia.")}</li>
      </ul>

      <h3>{t("4. Transition function", "4. Función de transición")}</h3>
      <Eq>{r`S_{t+1}=S^M(S_t,x_t,W_{t+1})`}</Eq>
      <Eq>{r`\begin{aligned}
n_{s,t+1}&=n_{s,t}+\text{seated}_{s,t}(x_t,A_{t+1})-\text{drops}_{s,t+1}\pm\text{moved}_{s,t}(x_t)\\
w_{c,t+1}&=w_{c,t}+A_{c,t+1}-\textstyle\sum_{s\in c}\text{seated}_{s,t}-\text{reneged}_{c,t+1}\\
B_{t+1}&=B_t-f^{\text{hire}}\textstyle\sum_a y_a-\sum_{\text{new adjunct sections}}\kappa_a,\qquad \alpha_a=t+2\ \text{if}\ y_a=1
\end{aligned}`}</Eq>
      <p className="prose">{t("Seating rule (not a decision): each request goes to the active section of its course with the most free seats; otherwise it joins the course waitlist, which is served first-come first-served whenever seats appear. At t = 6, orphaned sections that still have no instructor are cancelled. Their students are re-seated where possible (counted as moved) and the rest are unserved, as are students still on a waitlist. Empty sections are dropped at no cost.",
        "Regla de asignación (no es decisión): cada solicitud va a la sección activa de su curso con más lugares libres; si no hay, entra a la lista de espera del curso, que se atiende por orden de llegada cuando aparecen lugares. En t = 6 se cancelan las secciones huérfanas que siguen sin docente. Sus alumnos se reubican si es posible (cuentan como cambiados) y los demás quedan sin lugar, igual que quien siga en lista de espera. Las secciones vacías se eliminan sin costo.")}</p>

      <h3>{t("5. Objective", "5. Objetivo")}</h3>
      <Eq>{r`\min_{\pi}\ \mathbb E\Big[\underbrace{\textstyle\sum_{s\ \text{running}}\big(\kappa_{i(s)}+c^{\text{room}}_{r(s)}\big)}_{\text{instructors + rooms}}+f^{\text{hire}}N^{\text{hired}}+c^{\text{move}}N^{\text{moves}}+P_u\,U+P_c\,C\ \Big|\ S_0\Big]`}</Eq>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t("Symbol", "Símbolo")}</th><th>{t("Meaning", "Significado")}</th><th className="num">{t("Value", "Valor")}</th></tr></thead>
        <tbody>
          <tr><td><M>{r`\kappa_{\text{FT}}`}</M></td><td>{t("full-time salary share per section taught", "parte del salario de tiempo completo por sección impartida")}</td><td className="num">{money(c.ft_section_cost, lang)}</td></tr>
          <tr><td><M>{r`\kappa_a`}</M></td><td>{t("adjunct pay per section", "pago al adjunto por sección")}</td><td className="num">{money(Math.min(...inst.adjuncts.map((a) => a.cost_per_section)), lang)} – {money(Math.max(...inst.adjuncts.map((a) => a.cost_per_section)), lang)}</td></tr>
          <tr><td><M>{r`c^{\text{room}}_r`}</M></td><td>{t("room cost per section = base + per seat × capacity", "costo de salón por sección = base + por lugar × capacidad")}</td><td className="num">{money(c.room_base, lang)} + {money(c.room_per_seat, lang)}·cap</td></tr>
          <tr><td><M>{r`f^{\text{hire}}`}</M></td><td>{t("one-off adjunct hiring fee", "cuota única de contratación de adjunto")}</td><td className="num">{money(c.adjunct_hire_fee, lang)}</td></tr>
          <tr><td><M>{r`c^{\text{move}}`}</M></td><td>{t("administrative cost of a room change", "costo administrativo de un cambio de salón")}</td><td className="num">{money(c.room_move_admin, lang)}</td></tr>
          <tr><td><M>{r`P_u`}</M></td><td>{t("penalty per student left without a seat (gave up on the waitlist, still waiting at the start of classes, or displaced by a cancelled orphan section)", "penalización por alumno sin lugar (se rindió en la lista de espera, sigue esperando al inicio de clases o quedó desplazado por una sección huérfana cancelada)")}</td><td className="num">{money(c.penalty_unserved, lang)}</td></tr>
          <tr><td><M>{r`P_c`}</M></td><td>{t("penalty per student whose section is changed after publication (merge, cancel, re-timing)", "penalización por alumno cuya sección cambia tras publicarse (fusión, cancelación, cambio de horario)")}</td><td className="num">{money(c.penalty_change, lang)}</td></tr>
          <tr><td><M>{r`B_0`}</M></td><td>{t("adjustment budget (adjunct cash); a hard constraint, not a cost", "presupuesto de ajustes (efectivo para adjuntos); restricción dura, no costo")}</td><td className="num">{money(c.budget, lang)}</td></tr>
        </tbody>
      </table></div>
      <p className="prose small muted">{t("The penalty values are assumptions of this study, chosen to be plausible for a private university (P_u is roughly the tuition value of one course seat). The Recommendation page shows how the ranking moves when they change.", "Los valores de las penalizaciones son supuestos de este estudio, elegidos para ser plausibles en una universidad privada (P_u es aproximadamente el valor de colegiatura de un lugar en un curso). La página Recomendación muestra cómo cambia el orden cuando se modifican.")}</p>
    </>
  );
}
