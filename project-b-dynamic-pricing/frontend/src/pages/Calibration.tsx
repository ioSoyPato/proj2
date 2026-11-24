import { useData } from "../lib/data";
import { useLang } from "../lib/i18n";
import { num } from "../lib/format";
import { CalibrationBanner, ErrorBox, Loading, Panel } from "../components/ui";
import { ArrivalCurve, CalibrationFit, FareCurve } from "../components/charts";
import { Eq } from "../components/Eq";

export function CalibrationPage() {
  const { cal, meta, error, reload } = useData();
  const { p, lang } = useLang();
  if (error) return <ErrorBox msg={error} onRetry={reload} />;
  if (!cal || !meta) return <Loading />;
  const real = cal.is_real_data && cal.fit && cal.curve && cal.provenance && cal.sample;
  return (
    <>
      <CalibrationBanner />
      <h1>{p("Borrowing a booking curve from airlines", "Tomar prestada la curva de reservas de las aerolíneas")}</h1>
      <p className="lede">
        {p("A flight is a concert with wings: fixed capacity, a hard deadline, and seats worth nothing after departure. The Expedia 2022 Flight Prices dataset records seatsRemaining and totalFare for the same flight on many search dates, which is enough to see how bookings accelerate as departure nears.",
          "Un vuelo es un concierto con alas: capacidad fija, fecha límite y asientos que no valen nada tras el despegue. El conjunto Flight Prices de Expedia 2022 registra seatsRemaining y totalFare del mismo vuelo en muchas fechas de búsqueda, lo suficiente para ver cómo se aceleran las reservas al acercarse la salida.")}
      </p>

      <h2>{p("Estimator", "Estimador")}</h2>
      <ol>
        <li>{p("Keep a few busy nonstop routes (here LAX→JFK, ATL→LGA and ORD→LGA) and searches 1–60 days before departure.", "Conservar algunas rutas concurridas sin escalas (aquí LAX→JFK, ATL→LGA y ORD→LGA) y búsquedas 1–60 días antes de la salida.")}</li>
        <li>{p("For each flight (legId), the drop in seatsRemaining between two consecutive snapshots is a lower bound on seats booked in between; divide by the days between them. Expedia caps the displayed count (at 10 in this data), so pairs starting at the cap and zero readings are dropped.",
          "Para cada vuelo (legId), la caída de seatsRemaining entre dos observaciones consecutivas es una cota inferior de los asientos reservados entre ellas; se divide entre los días transcurridos. Expedia limita el número mostrado (a 10 en estos datos), así que se descartan los pares que empiezan en el tope y las lecturas en cero.")}</li>
        <li>{p("Average this booking proxy by days-to-departure d (all routes pooled) and fit by weighted non-linear least squares:", "Promediar este proxy de reservas por días a la salida d (todas las rutas combinadas) y ajustar por mínimos cuadrados no lineales ponderados:")}</li>
      </ol>
      <Eq>{"\\bar y_d = a\\, e^{-b\\, d}\\qquad\\Longrightarrow\\qquad \\lambda_t \\propto e^{-b\\,(d_t - 1)}"}</Eq>
      <p>{p("Only the shape b is transferred to the concert; the level Λ stays a promoter input, because one aircraft's seats say nothing about a concert audience. Fit quality is reported as weighted R², RMSE and a flight-level bootstrap 90% interval for b.",
        "Solo la forma b se transfiere al concierto; el nivel Λ sigue siendo un dato del promotor, porque los asientos de un avión no dicen nada del público de un concierto. La calidad del ajuste se reporta con R² ponderado, RMSE y un intervalo bootstrap del 90% por vuelo para b.")}</p>

      {real ? (
        <>
          <Panel title={p("Fit on real data", "Ajuste con datos reales")}
            sub={`${cal.provenance!.routes.join(", ")} · ${num(cal.sample!.n_flights, lang)} ${p("flights", "vuelos")} · ${num(cal.sample!.n_pairs, lang)} ${p("snapshot pairs", "pares de observaciones")}`}>
            <CalibrationFit d={cal.curve!.d} y={cal.curve!.y} fitted={cal.curve!.fitted} />
            <dl className="defs">
              <dt>b</dt><dd>{cal.fit!.b.toFixed(4)} {cal.fit!.b_ci90 && `(90% CI ${cal.fit!.b_ci90[0].toFixed(4)} – ${cal.fit!.b_ci90[1].toFixed(4)}, ${cal.fit!.n_boot} bootstrap)`}</dd>
              <dt>a</dt><dd>{cal.fit!.a.toFixed(4)}</dd>
              <dt>R² ({p("weighted", "ponderado")})</dt><dd>{cal.fit!.r2_weighted.toFixed(3)}</dd>
              <dt>RMSE</dt><dd>{cal.fit!.rmse.toFixed(4)}</dd>
              <dt>{p("Last/first day traffic", "Tráfico último/primer día")}</dt><dd>×{cal.fit!.last_to_first_day_ratio.toFixed(2)}</dd>
            </dl>
          </Panel>
          {cal.per_route && Object.keys(cal.per_route).length > 0 && (
            <Panel title={p("Robustness: one fit per route", "Robustez: un ajuste por ruta")}
              sub={p("The shipped b pools all routes; per-route fits show how much the shape varies between markets.", "El b usado combina todas las rutas; los ajustes por ruta muestran cuánto varía la forma entre mercados.")}>
              <div className="scrollx">
                <table className="t">
                  <thead><tr><th>{p("Route", "Ruta")}</th><th>b</th><th>R²</th><th>{p("Flights", "Vuelos")}</th><th>{p("Pairs", "Pares")}</th></tr></thead>
                  <tbody>
                    {Object.entries(cal.per_route).map(([r, f]) => (
                      <tr key={r}>
                        <td>{r}</td>
                        <td>{f.b !== undefined ? f.b.toFixed(4) : "—"}</td>
                        <td>{f.r2_weighted !== undefined ? f.r2_weighted.toFixed(3) : "—"}</td>
                        <td>{f.n_flights !== undefined ? num(f.n_flights, lang) : "—"}</td>
                        <td>{f.n_pairs !== undefined ? num(f.n_pairs, lang) : f.error ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          {cal.curve!.mean_fare.some((v) => v !== null) && (
            <Panel title={p("What airlines charge on the same days", "Lo que cobran las aerolíneas esos mismos días")}
              sub={p("Mean lowest totalFare by days to departure on these routes. Shown for context only; not used by the simulator.", "totalFare mínima promedio por días a la salida en estas rutas. Solo como contexto; el simulador no la usa.")}>
              <FareCurve d={cal.curve!.d} fare={cal.curve!.mean_fare} />
            </Panel>
          )}
          <Panel title={p("Provenance", "Procedencia")}>
            <dl className="defs">
              <dt>{p("Source", "Fuente")}</dt><dd>{cal.provenance!.source}</dd>
              <dt>{p("Rows scanned", "Filas leídas")}</dt><dd>{num(cal.provenance!.lines_scanned, lang)} ({(cal.provenance!.bytes_scanned / 1e9).toFixed(2)} GB){cal.provenance!.stopped_early ? p(", stopped early", ", detenido antes") : ""}</dd>
              <dt>{p("Route rows kept", "Filas de la ruta")}</dt><dd>{num(cal.provenance!.rows_kept, lang)}</dd>
              <dt>{p("Search dates", "Fechas de búsqueda")}</dt><dd>{cal.sample!.search_date_range.join(" → ")}</dd>
              <dt>{p("Flight dates", "Fechas de vuelo")}</dt><dd>{cal.sample!.flight_date_range.join(" → ")}</dd>
              <dt>{p("Created", "Creado")}</dt><dd>{cal.provenance!.created_at}</dd>
            </dl>
          </Panel>
        </>
      ) : (
        <Panel title={p("Status: running on default parameters", "Estado: usando parámetros por defecto")}>
          <p>
            {p(`No real-data calibration has been run yet, and none is faked. The simulator uses the documented default shape b = ${meta.default_arrival_decay_uncalibrated} (the last day gets about ${Math.exp(meta.default_arrival_decay_uncalibrated * 59).toFixed(1)}× the traffic of the first).`,
              `Todavía no se ha corrido una calibración con datos reales, y no se inventa ninguna. El simulador usa la forma por defecto documentada b = ${meta.default_arrival_decay_uncalibrated} (el último día recibe cerca de ${Math.exp(meta.default_arrival_decay_uncalibrated * 59).toFixed(1)}× el tráfico del primero).`)}
          </p>
          <p>{p("No public mirror of the dataset exists outside Kaggle, which requires an account. To calibrate:", "No existe una copia pública del conjunto fuera de Kaggle, que requiere una cuenta. Para calibrar:")}</p>
          <ol>
            <li>{p("Kaggle → Settings → API → Create New Token; copy username and key into ", "Kaggle → Settings → API → Create New Token; copia usuario y clave en ")}<code>credentials.env</code> (<code>KAGGLE_USERNAME</code>, <code>KAGGLE_KEY</code>). {p("Or point ", "O apunta ")}<code>FLIGHT_PRICES_CSV</code>{p(" at a local copy (even a partial one).", " a una copia local (aunque sea parcial).")}</li>
            <li><code>cd backend && python -m scripts.calibrate</code> — {p("streams the 31 GB CSV and keeps only the route rows (no full download to disk; --max-gb stops early).", "lee el CSV de 31 GB en streaming y guarda solo las filas de la ruta (sin descargarlo completo; --max-gb detiene antes).")}</li>
            <li><code>python -m scripts.train_rl && python -m scripts.precompute</code> — {p("re-trains RL and refreshes every number for the new shape.", "re-entrena RL y actualiza todos los números con la nueva forma.")}</li>
          </ol>
          <p className="small muted">
            {p("Detected inputs", "Entradas detectadas")}: Kaggle {meta.credentials.kaggle ? "✓" : "—"} · FLIGHT_PRICES_CSV {meta.credentials.flight_prices_csv ? "✓" : "—"} · GRB_LICENSE_FILE {meta.credentials.gurobi_license_file ? "✓" : "—"}
          </p>
        </Panel>
      )}
      <Panel title={p("Arrival curve currently used", "Curva de llegadas en uso")}
        sub={p(`Expected potential buyers per day at default demand (b = ${meta.calibration.b.toFixed(4)}).`, `Compradores potenciales esperados por día con la demanda base (b = ${meta.calibration.b.toFixed(4)}).`)}>
        <ArrivalCurve rates={meta.arrival_rates} />
      </Panel>
    </>
  );
}
