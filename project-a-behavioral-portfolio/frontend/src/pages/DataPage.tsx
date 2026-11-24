import type { Analysis } from "../lib/api";
import { CLASS_NAMES, L, useLang, usePick } from "../lib/i18n";
import { classColor, CLASS_ORDER } from "../components/charts";
import { Callout, Panel, Swatch, Table, useFmt } from "../components/ui";
import { useStore } from "../lib/store";

export function DataPage({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const pick = usePick();
  const { num } = useFmt();
  const { meta } = useStore();
  const d = a.data;
  return (
    <div>
      <h1>{tx("Data and reproducibility", "Datos y reproducibilidad")}</h1>
      {d.synthetic ? (
        <Callout tone="loss">
          {tx("SYNTHETIC FALLBACK DATA: Yahoo Finance could not be reached when the dataset was built. Numbers below are illustrative only.", "DATOS SINTÉTICOS DE RESPALDO: no se pudo acceder a Yahoo Finance al construir el conjunto de datos. Los números son sólo ilustrativos.")}
        </Callout>
      ) : (
        <p className="lede">
          {tx(
            `Real data: ${d.tickers.length} ETFs downloaded with yfinance on ${d.downloaded_at.slice(0, 10)}, daily adjusted closes resampled to month-end, ${d.n_months} monthly returns from ${d.start} to ${d.end}. The CSV is committed, so nothing needs the network at run time.`,
            `Datos reales: ${d.tickers.length} ETF descargados con yfinance el ${d.downloaded_at.slice(0, 10)}, cierres diarios ajustados remuestreados a fin de mes, ${d.n_months} retornos mensuales de ${d.start} a ${d.end}. El CSV está en el repositorio, así que nada necesita red en tiempo de ejecución.`,
          )}
        </p>
      )}
      <Panel title={tx("Universe: 8 asset classes", "Universo: 8 clases de activo")}>
        <Table
          leftCols={2}
          head={[tx("Asset class", "Clase de activo"), tx("ETFs", "ETF")]}
          rows={CLASS_ORDER.filter((c) => d.classes.includes(c)).map((c) => [
            <span><Swatch color={classColor(c)} />{pick(CLASS_NAMES[c], c)}</span>,
            <span style={{ whiteSpace: "normal" }}>{d.tickers.filter((t) => d.asset_class[t] === c).map((t) => `${t} (${d.names[t]})`).join(", ")}</span>,
          ])}
        />
      </Panel>
      <Panel title={tx("Random streams", "Flujos aleatorios")}>
        <Table
          leftCols={1}
          head={[tx("Purpose", "Propósito"), tx("Seed", "Semilla"), tx("Scenarios", "Escenarios")]}
          rows={[
            [tx("Tuning (band b, CFA L and θ)", "Calibración (banda b, L y θ de la CFA)"), `${a.tuning.seed}`, `${a.tuning.n}`],
            [tx("Final evaluation", "Evaluación final"), `${a.evaluation.seed}`, `${a.evaluation.n}`],
            [tx("Sensitivity (λ and cost sweeps)", "Sensibilidad (barridos de λ y costo)"), `${meta?.seeds.sensitivity ?? "—"}`, "500"],
          ]}
        />
        <p className="small" style={{ marginTop: "0.6rem" }}>
          {tx("Each scenario is a 120-month index path from a block bootstrap (blocks of 3–6 months, numpy default_rng). Every policy in a run receives the identical index matrix. Tests assert that tuning and evaluation paths never coincide.", "Cada escenario es una trayectoria de 120 índices de meses de un bootstrap en bloques (bloques de 3–6 meses, numpy default_rng). Todas las políticas de una corrida reciben la misma matriz de índices. Las pruebas verifican que las trayectorias de calibración y evaluación nunca coincidan.")}
        </p>
      </Panel>
      <Panel title={tx("Reproduce", "Reproducir")}>
        <pre style={{ overflowX: "auto", background: "var(--paper-sunk)", padding: "0.8rem", borderRadius: 6, fontSize: "0.82rem" }}>{`cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_data.py      # ${tx("optional: refresh prices", "opcional: actualizar precios")}
python -m scripts.precompute         # ${tx("tuning + evaluation + sensitivity", "calibración + evaluación + sensibilidad")} (~${num((a.timings.precompute_total ?? 0) / 60, 1)} min)
pytest -q`}</pre>
      </Panel>
      <Callout tone="neutral">
        <L
          en="Honest limitations: the MILP portfolio and the simulator use the same 2008–2026 history (in-sample optimism); the bootstrap cannot produce returns outside that history and keeps memory only within blocks; no taxes, contributions or withdrawals; the questionnaire uses stated preferences and no probability weighting; the behavioral mapping from answers to (d, r, k, f) is a modeling choice."
          es="Limitaciones honestas: el portafolio MILP y el simulador usan la misma historia 2008–2026 (optimismo dentro de muestra); el bootstrap no puede producir retornos fuera de esa historia y sólo conserva memoria dentro de los bloques; sin impuestos, aportaciones ni retiros; el cuestionario usa preferencias declaradas y no pondera probabilidades; el mapeo conductual de respuestas a (d, r, k, f) es una decisión de modelado."
        />
      </Callout>
    </div>
  );
}
