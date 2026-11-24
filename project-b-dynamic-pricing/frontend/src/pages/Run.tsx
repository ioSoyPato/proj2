import { useData } from "../lib/data";
import { useLang } from "../lib/i18n";
import { Panel } from "../components/ui";

export function RunPage() {
  const { p } = useLang();
  const { meta } = useData();
  return (
    <>
      <h1>{p("Run it yourself", "Ejecútalo tú")}</h1>
      <p className="lede">{p("One container serves the API and this site. Everything else is optional.", "Un contenedor sirve la API y este sitio. Todo lo demás es opcional.")}</p>
      <Panel title={p("One command (Docker)", "Un comando (Docker)")}>
        <pre className="code">{`docker build -t ticket-pricing .
docker run -p 8002:8000 ticket-pricing
# → http://localhost:8002`}</pre>
      </Panel>
      <Panel title={p("Local development", "Desarrollo local")}>
        <pre className="code">{`# backend (terminal 1)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.api.main:app --port 8002 --reload

# frontend (terminal 2)
cd frontend
npm install
npm run dev        # → http://localhost:5182`}</pre>
      </Panel>
      <Panel title={p("Regenerate every number", "Regenerar todos los números")}>
        <pre className="code">{`cd backend
python -m scripts.calibrate --routes LAX-JFK,ATL-LGA,ORD-LGA  # needs KAGGLE_API_TOKEN
python -m scripts.train_rl      # ~3 min, numpy only
python -m scripts.precompute    # tuning + 600-scenario evaluation + sensitivity
python -m pytest -q             # sanity checks`}</pre>
        <p className="small muted">
          {p("Inputs that need credentials live in ", "Las entradas que requieren credenciales viven en ")}<code>../credentials.env</code>
          {p(" (git-ignored, shared with the sibling projects): KAGGLE_API_TOKEN (or KAGGLE_USERNAME + KAGGLE_KEY), FLIGHT_PRICES_CSV, GRB_LICENSE_FILE.", " (ignorado por git, compartido con los proyectos hermanos): KAGGLE_USERNAME, KAGGLE_KEY, FLIGHT_PRICES_CSV, GRB_LICENSE_FILE.")}
        </p>
      </Panel>
      {meta && (
        <Panel title={p("This server", "Este servidor")}>
          <dl className="defs">
            <dt>{p("DLA solver", "Solver DLA")}</dt>
            <dd>{meta.solver.preferred === "gurobi" ? `Gurobi ${meta.solver.version} — ${meta.solver.licence}` : `HiGHS (${meta.solver.version})`}{meta.solver.gurobi_unavailable_reason ? ` · Gurobi: ${meta.solver.gurobi_unavailable_reason}` : ""}</dd>
            <dt>{p("Calibration", "Calibración")}</dt>
            <dd>{meta.calibration.is_real_data ? `${meta.calibration.route} (b = ${meta.calibration.b.toFixed(4)})` : p(`default parameters (b = ${meta.calibration.b})`, `parámetros por defecto (b = ${meta.calibration.b})`)}</dd>
            <dt>{p("RL weights", "Pesos RL")}</dt>
            <dd>{meta.rl.included ? p("loaded", "cargados") : p("missing", "faltan")}</dd>
            <dt>{p("Precomputed study", "Estudio precalculado")}</dt>
            <dd>{meta.precomputed.generated_at ?? p("missing", "falta")}</dd>
          </dl>
        </Panel>
      )}
    </>
  );
}
