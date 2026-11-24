import { useEffect, useRef, useState } from "react";
import { api, type ProfileOut, type Question } from "../lib/api";
import { RISK_LABEL, useLang, usePick } from "../lib/i18n";
import { BLOCK_TITLE, QUESTION_TEXT } from "../lib/questions";
import { DEFAULT_SETTINGS, useStore, type ClientSettings } from "../lib/store";
import { ValueFunction } from "../components/charts";
import { BehaviorCostBlock, ComparisonTable, FanBlock, PlainLanguage, PortfolioBlock, RecommendationCard } from "../components/Results";
import { Callout, ErrorBox, Loading, Panel, useFmt } from "../components/ui";

function QuestionRow({ q, n, value, onChange }: { q: Question; n: number; value: number; onChange: (v: number) => void }) {
  const pick = usePick();
  const { money } = useFmt();
  const txt = QUESTION_TEXT[q.id];
  return (
    <div className="q">
      <div className="q-head">
        <span className="q-num">{n}</span>
        <div>
          <div className="q-text">{pick(txt.text)}</div>
          <div className="q-help">{pick(txt.help)}</div>
        </div>
      </div>
      <div className="choices" role="radiogroup" aria-label={pick(txt.text)}>
        {q.options.map((o, i) => (
          <button key={o} className="choice" role="radio" aria-checked={value === o} aria-pressed={value === o} onClick={() => onChange(o)}>
            {txt.options ? pick(txt.options[i]) : money(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileCard({ prof }: { prof: ProfileOut | null }) {
  const { tx } = useLang();
  const pick = usePick();
  const { pct, num } = useFmt();
  if (!prof) return <Loading label={tx("Estimating…", "Estimando…")} />;
  return (
    <div>
      <div className="small muted">{tx("Your estimated value function", "Tu función de valor estimada")}</div>
      <ValueFunction x={prof.value_curve.x} v={prof.value_curve.v} height={230} compact />
      <div style={{ fontWeight: 700, fontSize: "1.05rem", margin: "0.2rem 0 0.5rem" }}>
        λ = {num(prof.lam, 2)}: {pick(RISK_LABEL[prof.risk_label])}
      </div>
      <table className="tbl" style={{ fontSize: "0.83rem" }}>
        <tbody>
          <tr><td>α {tx("(curvature, gains)", "(curvatura, ganancias)")}</td><td>{num(prof.alpha, 3)}</td></tr>
          <tr><td>β {tx("(curvature, losses)", "(curvatura, pérdidas)")}</td><td>{num(prof.beta, 3)}</td></tr>
          <tr><td>λ {tx("(loss aversion)", "(aversión a pérdidas)")}</td><td>{num(prof.lam, 3)}</td></tr>
          <tr><td>{tx("CVaR limit for the MILP", "Límite de CVaR para el MILP")}</td><td>{pct(prof.cvar_cap, 2)}</td></tr>
          <tr><td>{tx("Panic at drawdown d", "Pánico con caída d")}</td><td>{prof.panic_drawdown >= 1 ? tx("never", "nunca") : pct(prof.panic_drawdown, 0)}</td></tr>
          <tr><td>{tx("Re-entry after rebound r", "Reingreso tras rebote r")}</td><td>{pct(prof.reentry_recovery, 0)}</td></tr>
          <tr><td>{tx("Chasing intensity k", "Intensidad de persecución k")}</td><td>{pct(prof.chase_intensity, 0)}</td></tr>
          <tr><td>{tx("Review every f months", "Revisión cada f meses")}</td><td>{prof.review_months}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function SettingsForm({ s, set }: { s: ClientSettings; set: (s: ClientSettings) => void }) {
  const { tx } = useLang();
  const { money, pct } = useFmt();
  const upd = (k: keyof ClientSettings, v: number) => set({ ...s, [k]: v });
  const infeasible = s.max_assets * s.max_weight < 1;
  return (
    <div>
      <div className="grid3">
        <div className="field">
          <label htmlFor="w0">{tx("Amount to invest", "Monto a invertir")}: <strong>{money(s.initial_wealth)}</strong></label>
          <input id="w0" type="range" min={10000} max={1000000} step={10000} value={s.initial_wealth} onChange={(e) => upd("initial_wealth", +e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="g">{tx("Reference point: growth target per year", "Punto de referencia: meta de crecimiento anual")}: <strong>{pct(s.target_growth, 1)}</strong></label>
          <input id="g" type="range" min={0} max={0.08} step={0.005} value={s.target_growth} onChange={(e) => upd("target_growth", +e.target.value)} />
          <span className="small muted">{s.target_growth === 0 ? tx("0% = \"don't end below what I put in\"", "0% = \"no terminar con menos de lo que puse\"") : tx(`ends below ${money(s.initial_wealth * (1 + s.target_growth) ** 10)} feel like losses`, `terminar bajo ${money(s.initial_wealth * (1 + s.target_growth) ** 10)} se siente como pérdida`)}</span>
        </div>
        <div className="field">
          <label htmlFor="k">{tx("Most funds to hold (K)", "Máximo de fondos (K)")}: <strong>{s.max_assets}</strong></label>
          <input id="k" type="range" min={3} max={15} step={1} value={s.max_assets} onChange={(e) => upd("max_assets", +e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="u">{tx("Largest single fund (u)", "Mayor peso por fondo (u)")}: <strong>{pct(s.max_weight, 0)}</strong></label>
          <input id="u" type="range" min={0.1} max={0.6} step={0.05} value={s.max_weight} onChange={(e) => upd("max_weight", +e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sc">{tx("Largest asset class", "Mayor peso por clase de activo")}: <strong>{pct(s.max_class_weight, 0)}</strong></label>
          <input id="sc" type="range" min={0.25} max={1} step={0.05} value={s.max_class_weight} onChange={(e) => upd("max_class_weight", +e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c">{tx("Trading cost", "Costo de transacción")}: <strong>{s.cost_bp} bp</strong></label>
          <input id="c" type="range" min={0} max={100} step={5} value={s.cost_bp} onChange={(e) => upd("cost_bp", +e.target.value)} />
        </div>
      </div>
      {infeasible && (
        <Callout tone="loss">{tx("K × u is below 100%: no fully invested portfolio fits. Raise K or u.", "K × u es menor a 100%: ningún portafolio totalmente invertido cabe. Sube K o u.")}</Callout>
      )}
    </div>
  );
}

export function Advisor() {
  const { tx } = useLang();
  const pick = usePick();
  const { meta, answers, setAnswer, resetAnswers, settings, setSettings, live, running, runError, run, base } = useStore();
  const [prof, setProf] = useState<ProfileOut | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!Object.keys(answers).length) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.profile(answers).then(setProf).catch(() => setProf(null));
    }, 150);
    return () => window.clearTimeout(timer.current);
  }, [answers]);

  if (!meta) return <Loading label={tx("Loading questionnaire…", "Cargando cuestionario…")} />;

  const blocks = ["alpha", "beta", "lambda", "bias"] as const;
  let n = 0;
  const infeasible = settings.max_assets * settings.max_weight < 1;
  const shown = live ?? base;

  const onRun = async () => {
    await run();
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <h1>{tx("Advisor dashboard", "Tablero del asesor")}</h1>
      <p className="lede">
        {tx(
          "Ten questions, about four minutes. The answers set the client's value function and behavior; the backend then builds the portfolio and simulates ten years of the client living with it.",
          "Diez preguntas, unos cuatro minutos. Las respuestas fijan la función de valor y el comportamiento del cliente; luego el backend construye el portafolio y simula diez años del cliente viviendo con él.",
        )}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 19rem)", gap: "1.5rem", alignItems: "start" }} className="advisor-grid">
        <div>
          {blocks.map((b) => (
            <div key={b}>
              <h3>{pick(BLOCK_TITLE[b])}</h3>
              {meta.questions.filter((q) => q.block === b).map((q) => {
                n += 1;
                return <QuestionRow key={q.id} q={q} n={n} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />;
              })}
            </div>
          ))}
          <button className="btn ghost" style={{ marginTop: "0.6rem" }} onClick={resetAnswers}>{tx("Reset answers", "Restablecer respuestas")}</button>
        </div>
        <aside className="panel" style={{ position: "sticky", top: "1rem", margin: 0 }}>
          <ProfileCard prof={prof} />
        </aside>
      </div>

      <h2>{tx("The client's situation", "La situación del cliente")}</h2>
      <Panel>
        <SettingsForm s={settings} set={setSettings} />
        <div style={{ display: "flex", gap: "0.8rem", alignItems: "center", flexWrap: "wrap", marginTop: "1.1rem" }}>
          <button className="btn" onClick={onRun} disabled={running || infeasible}>
            {running ? tx("Simulating…", "Simulando…") : tx(`Build the portfolio and simulate ${settings.n_scenarios} futures`, `Construir el portafolio y simular ${settings.n_scenarios} futuros`)}
          </button>
          <button className="btn ghost" onClick={() => setSettings(DEFAULT_SETTINGS)} disabled={running}>{tx("Default settings", "Valores por defecto")}</button>
          <span className="small muted">{tx("Takes about ten seconds: about 4,500 small MILPs are solved for the annual re-optimization policy.", "Toma unos diez segundos: se resuelven unos 4,500 MILP pequeños para la política de re-optimización anual.")}</span>
        </div>
        {running && <Loading label={tx("Solving the MILP, tuning the band on the tuning seed, then evaluating six policies on 500 shared scenarios…", "Resolviendo el MILP, calibrando la banda con la semilla de calibración y evaluando seis políticas en 500 escenarios compartidos…")} />}
        {runError && <ErrorBox error={runError} />}
      </Panel>

      <div ref={resultsRef} style={{ scrollMarginTop: "4rem" }}>
        <h2>{live ? tx("Results for this client", "Resultados para este cliente") : tx("Results for the default profile", "Resultados para el perfil por defecto")}</h2>
        {!live && (
          <Callout tone="neutral">
            {tx("These are the precomputed results for the default answers. Press the button above to run the client's own answers.", "Estos son los resultados precalculados para las respuestas por defecto. Presiona el botón de arriba para correr las respuestas del cliente.")}
          </Callout>
        )}
        {shown && (
          <div style={{ opacity: running ? 0.45 : 1, transition: "opacity 0.2s" }}>
            <RecommendationCard a={shown} />
            <PortfolioBlock a={shown} />
            <FanBlock a={shown} />
            <BehaviorCostBlock a={shown} />
            <Panel title={tx("All policies, side by side", "Todas las políticas, lado a lado")} sub={tx(`Terminal wealth after 10 years, ${shown.evaluation.n} evaluation scenarios (seed ${shown.evaluation.seed}). The highlighted row is the recommendation.`, `Riqueza final a 10 años, ${shown.evaluation.n} escenarios de evaluación (semilla ${shown.evaluation.seed}). La fila resaltada es la recomendación.`)}>
              <ComparisonTable a={shown} metric="wealth" />
              <h3>{tx("In plain language", "En lenguaje simple")}</h3>
              <PlainLanguage a={shown} />
            </Panel>
            {live && <p className="small muted">{tx(`Computed live in ${live.timings.total.toFixed(1)} s with ${live.solver}.`, `Calculado en vivo en ${live.timings.total.toFixed(1)} s con ${live.solver}.`)}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
