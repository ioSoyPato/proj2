import type { PageKey } from "../App";
import type { PolicyKey, Study, SweepRow } from "../lib/api";
import { useData } from "../lib/data";
import { useLang, type Lang } from "../lib/i18n";
import { num } from "../lib/format";
import { CalibrationBanner, ErrorBox, Loading, Panel } from "../components/ui";
import { Ticket } from "../components/Ticket";
import { ResultsBlock } from "../components/Results";
import { policyPhrase } from "../lib/explain";

const SWEEP_NAMES: Record<string, Record<Lang, string>> = {
  eta: { en: "loss aversion η", es: "aversión a la pérdida η" },
  theta: { en: "reference memory θ", es: "memoria de referencia θ" },
  demand_scale: { en: "demand level (× default)", es: "nivel de demanda (× base)" },
  demand_sigma: { en: "demand uncertainty σ_D", es: "incertidumbre de demanda σ_D" },
  gamma: { en: "gain sensitivity γ", es: "sensibilidad a ganancias γ" },
};

export function sweepName(k: string, lang: Lang) {
  return SWEEP_NAMES[k]?.[lang] ?? k;
}

/** Turn the sensitivity sweeps into "the recommendation changes when…" sentences. */
export function changeConditions(study: Study, lang: Lang): string[] {
  const sens = study.sensitivity;
  if (!sens) return [];
  const base = study.recommendation.policy;
  const out: string[] = [];
  for (const [k, rows] of Object.entries(sens.sweeps)) {
    const diff = (rows as SweepRow[]).filter((r) => r.recommended !== base);
    const name = sweepName(k, lang);
    if (diff.length === 0) {
      out.push(lang === "en"
        ? `Across every tested ${name} (${rows.map((r) => r.value).join(", ")}), ${policyPhrase(base, lang)} stays the recommendation.`
        : `En todos los valores probados de ${name} (${rows.map((r) => r.value).join(", ")}), ${policyPhrase(base, lang)} sigue siendo la recomendación.`);
    } else {
      const parts = diff.map((r) => `${r.value} → ${policyPhrase(r.recommended as PolicyKey, lang)}`);
      out.push(lang === "en"
        ? `With ${name} at ${parts.join("; ")}, the recommendation switches.`
        : `Con ${name} en ${parts.join("; ")}, la recomendación cambia.`);
    }
  }
  return out;
}

export function Overview({ go }: { go: (k: PageKey) => void }) {
  const { pre, error, reload } = useData();
  const { p, lang } = useLang();
  if (error) return <ErrorBox msg={error} onRetry={reload} />;
  if (!pre) return <Loading />;
  const c = pre.params;
  return (
    <>
      <CalibrationBanner />
      <h1>{p(`${num(c.capacity, lang)} seats, ${c.horizon} days, one price a day.`, `${num(c.capacity, "es")} asientos, ${c.horizon} días, un precio al día.`)}</h1>
      <p className="lede">
        {p(
          `A promoter opens ticket sales ${c.horizon} days before a concert. Each morning they pick a price between $${c.price_min} and $${c.price_max}; buyers remember yesterday's price, and any seat unsold on the night is worth nothing. Which pricing policy brings in the most money?`,
          `Un promotor abre la venta ${c.horizon} días antes de un concierto. Cada mañana elige un precio entre $${c.price_min} y $${c.price_max}; los compradores recuerdan el precio de ayer, y cualquier asiento sin vender la noche del evento no vale nada. ¿Qué política de precios recauda más?`,
        )}
      </p>
      <Ticket study={pre} />
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button className="btn" onClick={() => go("dashboard")}>{p("Try your own event", "Prueba tu propio evento")}</button>
        <button className="btn ghost" onClick={() => go("model")}>{p("See the model", "Ver el modelo")}</button>
      </div>

      <ResultsBlock study={pre} />

      <h2>{p("When would this advice change?", "¿Cuándo cambiaría este consejo?")}</h2>
      <p>
        {p(
          "Each policy was re-run on markets that differ from the default in one assumption at a time (fixed price re-optimised, rule re-tuned, lookahead re-solved, RL kept as trained).",
          "Cada política se volvió a correr en mercados que difieren del base en un supuesto a la vez (precio fijo re-optimizado, regla re-ajustada, anticipación re-resuelta, RL tal como se entrenó).",
        )}
      </p>
      <Panel>
        <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
          {changeConditions(pre, lang).map((s, i) => <li key={i} style={{ marginBottom: "0.4rem" }}>{s}</li>)}
        </ul>
        <button className="btn small ghost" style={{ marginTop: "0.6rem" }} onClick={() => go("sensitivity")}>
          {p("Open the sensitivity analysis", "Abrir el análisis de sensibilidad")}
        </button>
      </Panel>
      <p className="small muted">
        {p("Precomputed", "Precalculado")}: {pre.generated_at?.replace("T", " ").replace("+00:00", " UTC")} ·{" "}
        {p("DLA solver", "Solver DLA")}: {pre.solver.preferred === "gurobi" ? `Gurobi ${pre.solver.version}` : `HiGHS (${pre.solver.version})`}
      </p>
    </>
  );
}
