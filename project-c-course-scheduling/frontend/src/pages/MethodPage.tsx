import { ErrorBox, Loading, PageHead } from "../components/ui";
import { API_BASE } from "../lib/api";
import { useResults } from "../lib/hooks";
import { useData } from "../lib/useData";
import { useI18n } from "../lib/i18n";
import { num } from "../lib/format";

interface Health { credentials: { credentials_file_found: boolean; gurobi_license_file: boolean; course_data_dir: boolean }; gurobipy_installed: boolean }

export function MethodPage() {
  const { t, d, lang } = useI18n();
  const { data: r, error } = useResults();
  const H = useData<Health>("health", () => fetch(`${API_BASE}/api/health`).then((x) => x.json()));
  if (error) return <ErrorBox error={error} />;
  if (!r) return <Loading />;
  const sr = r.meta.seed_ranges;
  const yes = (b?: boolean) => (b ? t("yes", "sí") : t("no", "no"));
  return (
    <>
      <PageHead title={d("nav.method")} lede={t("How the comparison was made fair, and how to reproduce every number on this site.", "Cómo se hizo justa la comparación y cómo reproducir cada número de este sitio.")} />
      <h2 style={{ marginTop: 0 }}>{t("Three disjoint seed families", "Tres familias de semillas ajenas entre sí")}</h2>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>{t("Use", "Uso")}</th><th>{t("Seeds", "Semillas")}</th><th className="num">{t("Scenarios", "Escenarios")}</th></tr></thead>
        <tbody>
          <tr><td>{t("Training the Q-table", "Entrenar la tabla Q")}</td><td>{sr.training[0]}–{sr.training[1]}</td><td className="num">{num(sr.training[1] - sr.training[0] + 1, lang)}</td></tr>
          <tr><td>{t("Tuning N, M (waitlist rule) and θ (lookahead)", "Calibrar N, M (regla) y θ (anticipación)")}</td><td>{sr.tuning[0]}–{sr.tuning[1]}</td><td className="num">{r.meta.n_tune_pfa} / {r.meta.n_tune_dla}</td></tr>
          <tr><td>{t("Final evaluation and sensitivity", "Evaluación final y sensibilidad")}</td><td>{sr.evaluation[0]}–{sr.evaluation[1]}</td><td className="num">{r.meta.n_eval}</td></tr>
        </tbody>
      </table></div>
      <div className="prose">
        <p><strong>{t("Common random numbers. ", "Números aleatorios comunes. ")}</strong>{t(`A scenario is fully drawn from its seed before any policy acts: every student's course, arrival week, patience on the waitlist and drop time, and the week (if any) each professor drops out. All four policies therefore face exactly the same registration period, and the comparison is paired. The pipeline hashes each scenario and verified that the hashes match across policies: ${r.meta.crn_verified ? "passed" : "FAILED"}.`, `Un escenario se genera completo a partir de su semilla antes de que actúe cualquier política: el curso de cada alumno, su semana de llegada, su paciencia en la lista de espera y su momento de baja, y la semana (si la hay) en que cada profesor se va. Así las cuatro políticas enfrentan exactamente el mismo periodo de inscripción y la comparación es pareada. El proceso calcula un hash de cada escenario y verificó que coincidieran entre políticas: ${r.meta.crn_verified ? "aprobado" : "FALLÓ"}.`)}</p>
        <p><strong>{t("Statistics. ", "Estadística. ")}</strong>{t("For each metric we report the mean, standard deviation, 5th and 95th percentiles and a normal-approximation 95% confidence interval for the mean (mean ± 1.96·sd/√n). Policy differences use the paired per-scenario difference.", "Para cada métrica se reporta media, desviación estándar, percentiles 5 y 95 y un intervalo de confianza de 95% para la media por aproximación normal (media ± 1.96·de/√n). Las diferencias entre políticas usan la diferencia pareada por escenario.")}</p>
        <p><strong>{t("Automated checks ", "Pruebas automáticas ")}</strong>(<code>backend/tests</code>, pytest): {t("the instance matches the specified shape; both Phase-1 timetables pass an independent feasibility checker that re-implements every hard constraint, and the checker catches injected violations; scenarios are identical across policies; seed families are disjoint; the lookahead executes only decisions indexed by the current week, never the ones it planned for later; adjunct lead time is enforced (no seats before arrival); cost components add up and every student ends enrolled, dropped or unserved.", "la instancia tiene la forma especificada; ambos horarios de la Fase 1 pasan un verificador de factibilidad independiente que re-implementa cada restricción dura, y el verificador detecta violaciones inyectadas; los escenarios son idénticos entre políticas; las familias de semillas son ajenas; la anticipación ejecuta solo decisiones de la semana actual, nunca las planeadas para después; se respeta la anticipación de los adjuntos (sin lugares antes de su llegada); los componentes de costo suman y cada alumno termina inscrito, dado de baja o sin lugar.")}</p>
      </div>

      <h2>{t("Run it yourself", "Córrelo tú mismo")}</h2>
      <pre className="panel" style={{ overflowX: "auto", fontSize: "0.85rem" }}>{`docker build -t course-scheduling . && docker run -p 8003:8000 course-scheduling
# → http://localhost:8003  (container port 8000)

# ${t("or, for development", "o, para desarrollo")}
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.api.main:app --reload --port 8003
cd frontend && npm install && npm run dev        # http://localhost:5183
cd backend && .venv/bin/python -m scripts.precompute   # ${t("regenerate all results", "regenerar todos los resultados")}
cd backend && .venv/bin/pytest -q`}</pre>

      <h2>{t("Environment", "Entorno")}</h2>
      {H.data ? (
        <div className="table-wrap"><table className="data" style={{ width: "auto" }}><tbody>
          <tr><td>{t("credentials.env found", "credentials.env encontrado")}</td><td>{yes(H.data.credentials.credentials_file_found)}</td></tr>
          <tr><td>{t("Gurobi license file (GRB_LICENSE_FILE)", "Licencia de Gurobi (GRB_LICENSE_FILE)")}</td><td>{yes(H.data.credentials.gurobi_license_file)}{!H.data.credentials.gurobi_license_file && t(": the size-limited pip license is used when a model fits, HiGHS otherwise", ": se usa la licencia limitada de pip cuando el modelo cabe y HiGHS si no")}</td></tr>
          <tr><td>{t("gurobipy installed", "gurobipy instalado")}</td><td>{yes(H.data.gurobipy_installed)}</td></tr>
          <tr><td>{t("Official course data (COURSE_DATA_DIR)", "Datos oficiales del curso (COURSE_DATA_DIR)")}</td><td>{yes(H.data.credentials.course_data_dir)}{!H.data.credentials.course_data_dir && t(": using the synthetic instance", ": se usa la instancia sintética")}</td></tr>
        </tbody></table></div>
      ) : <Loading height={80} />}
      <p className="small muted">{t(`Results generated ${r.meta.generated_at} in ${num(r.meta.total_seconds / 60, lang, 1)} minutes on ${r.meta.workers} worker processes.`, `Resultados generados ${r.meta.generated_at} en ${num(r.meta.total_seconds / 60, lang, 1)} minutos con ${r.meta.workers} procesos.`)}</p>
    </>
  );
}
