import { useEffect, useRef, useState } from "react";
import { api, type Decision, type DecisionState, type Market, type Study } from "../lib/api";
import { marketFrom, useData } from "../lib/data";
import { useLang } from "../lib/i18n";
import { kMoney, money, num, pct } from "../lib/format";
import { CalibrationBanner, ErrorBox, Loading, Panel, PolicyName } from "../components/ui";
import { Ticket } from "../components/Ticket";
import { ResultsBlock } from "../components/Results";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

function RangeField({ label, value, min, max, step, onChange, hint, fmt }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
  hint?: string; fmt?: (v: number) => string;
}) {
  const id = `f-${label.replace(/\W+/g, "-")}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}<output>{fmt ? fmt(value) : value}</output></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function NumberField({ label, value, min, max, step, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string;
}) {
  const id = `n-${label.replace(/\W+/g, "-")}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function sameMarket(a: Market, b: Market) {
  return (Object.keys(a) as (keyof Market)[]).every((k) => a[k] === b[k]);
}

export function Dashboard() {
  const { meta, pre, error, reload, live, setLive, market, setMarket } = useData();
  const { t, p, lang } = useLang();
  const [n, setN] = useState(120);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [runErr, setRunErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  if (error) return <ErrorBox msg={error} onRetry={reload} />;
  if (!meta || !pre || !market) return <Loading />;

  const defaults = marketFrom(meta);
  const set = <K extends keyof Market>(k: K, v: Market[K]) => setMarket({ ...market, [k]: v });
  const isDefault = sameMarket(market, defaults);
  const shown: Study = live ?? pre;

  const run = async () => {
    setBusy(true); setRunErr(null); setElapsed(0);
    const t0 = Date.now();
    timer.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 250);
    try {
      setLive(await api.evaluate(market, n));
    } catch (e) {
      setRunErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (timer.current) window.clearInterval(timer.current);
      setBusy(false);
    }
  };

  const gridSize = Math.floor((market.price_max - market.price_min) / market.price_step) + 1;
  const rlWillDrop = market.horizon !== defaults.horizon || market.price_min !== defaults.price_min ||
    market.price_step !== defaults.price_step || market.price_max !== defaults.price_max;

  return (
    <>
      <CalibrationBanner />
      <h1>{p("Plan your sale", "Planea tu venta")}</h1>
      <p className="lede">
        {p("Describe your venue and your audience. The simulator re-tunes every policy for your inputs, runs them on the same random selling seasons and tells you which one to use and what to charge on day one.",
          "Describe tu recinto y tu público. El simulador re-ajusta cada política para tus datos, las corre en las mismas temporadas de venta aleatorias y te dice cuál usar y qué cobrar el primer día.")}
      </p>

      <Panel>
        <fieldset>
          <legend>{p("Venue and selling window", "Recinto y ventana de venta")}</legend>
          <div className="fields">
            <NumberField label={p("Capacity (seats)", "Capacidad (asientos)")} value={market.capacity} min={100} max={20000} step={100} onChange={(v) => set("capacity", v)} />
            <NumberField label={p("Days on sale", "Días a la venta")} value={market.horizon} min={10} max={120} step={1} onChange={(v) => set("horizon", v)} />
            <NumberField label={p("Lowest price ($)", "Precio mínimo ($)")} value={market.price_min} min={5} max={2000} step={5} onChange={(v) => set("price_min", v)} />
            <NumberField label={p("Highest price ($)", "Precio máximo ($)")} value={market.price_max} min={10} max={5000} step={5} onChange={(v) => set("price_max", v)} />
            <NumberField label={p("Price step ($)", "Paso de precio ($)")} value={market.price_step} min={1} max={500} step={1} onChange={(v) => set("price_step", v)}
              hint={p(`${gridSize} prices on the grid (max 60)`, `${gridSize} precios en la rejilla (máx. 60)`)} />
          </div>
        </fieldset>
        <fieldset>
          <legend>{p("Demand", "Demanda")}</legend>
          <div className="fields">
            <RangeField label={p("Potential buyers over the window", "Compradores potenciales en la ventana")} value={market.total_arrivals}
              min={1000} max={15000} step={100} onChange={(v) => set("total_arrivals", v)} fmt={(v) => num(v, lang)}
              hint={p("People who will look at the event page; arrivals speed up near the date.", "Personas que verán la página del evento; las llegadas se aceleran cerca de la fecha.")} />
            <RangeField label={p("Demand uncertainty σ_D", "Incertidumbre de demanda σ_D")} value={market.demand_sigma} min={0} max={0.6} step={0.05}
              onChange={(v) => set("demand_sigma", v)} fmt={(v) => v.toFixed(2)}
              hint={p("How wrong the buyer estimate could be (0 = known exactly).", "Qué tan equivocada puede estar la estimación (0 = se conoce exacto).")} />
            <RangeField label={p("Median willingness to pay", "Disposición a pagar mediana")} value={market.wtp_median} min={30} max={300} step={5}
              onChange={(v) => set("wtp_median", v)} fmt={(v) => money(v, lang)} />
            <RangeField label={p("Spread of willingness to pay σ", "Dispersión de la disposición a pagar σ")} value={market.wtp_sigma} min={0.1} max={1.0} step={0.05}
              onChange={(v) => set("wtp_sigma", v)} fmt={(v) => v.toFixed(2)} />
            <RangeField label={p("Scarcity boost κ", "Impulso por escasez κ")} value={market.kappa} min={1} max={3} step={0.1}
              onChange={(v) => set("kappa", v)} fmt={(v) => `×${v.toFixed(1)}`}
              hint={p("Extra traffic once fewer than 10% of seats remain.", "Tráfico extra cuando queda menos del 10% de los asientos.")} />
          </div>
        </fieldset>
        <fieldset>
          <legend>{p("Buyer psychology", "Psicología del comprador")}</legend>
          <div className="fields">
            <RangeField label={p("Price fans expect at launch r₀", "Precio que el público espera r₀")} value={market.ref_init} min={30} max={300} step={5}
              onChange={(v) => set("ref_init", v)} fmt={(v) => money(v, lang)} />
            <RangeField label={p("Memory of past prices θ", "Memoria de precios pasados θ")} value={market.theta} min={0} max={0.98} step={0.01}
              onChange={(v) => set("theta", v)} fmt={(v) => v.toFixed(2)}
              hint={p("High θ: the reference price moves slowly.", "θ alto: el precio de referencia se mueve lento.")} />
            <RangeField label={p("Loss aversion η", "Aversión a la pérdida η")} value={market.eta} min={0.05} max={3} step={0.05}
              onChange={(v) => set("eta", v)} fmt={(v) => v.toFixed(2)}
              hint={p("Extra sting of a price above what fans expect.", "Molestia extra de un precio por encima de lo esperado.")} />
            <RangeField label={p("Bargain appeal γ", "Atractivo de la oferta γ")} value={market.gamma} min={0} max={2} step={0.05}
              onChange={(v) => set("gamma", v)} fmt={(v) => v.toFixed(2)}
              hint={p("Extra pull of a price below what fans expect.", "Atracción extra de un precio por debajo de lo esperado.")} />
          </div>
        </fieldset>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: "14rem" }}>
            <RangeField label={t("dash.scen")} value={n} min={40} max={300} step={20} onChange={setN}
              hint={p("Live runs use fewer scenarios than the 600-scenario precomputed study.", "Las corridas en vivo usan menos escenarios que el estudio precalculado de 600.")} />
          </div>
          <button className="btn" onClick={run} disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden /> {elapsed.toFixed(0)} s</> : t("dash.run")}
          </button>
          <button className="btn ghost" onClick={() => { setMarket(defaults); setLive(null); }} disabled={busy || (isDefault && !live)}>
            {t("dash.reset")}
          </button>
        </div>
        {rlWillDrop && (
          <p className="small" style={{ color: "var(--rose)", marginTop: "0.7rem", marginBottom: 0 }}>
            {p("The RL agent was trained for the default window and price grid; with these settings it will be excluded.",
              "El agente RL se entrenó para la ventana y rejilla por defecto; con estos ajustes quedará excluido.")}
          </p>
        )}
        {busy && <p className="small muted" style={{ marginTop: "0.6rem", marginBottom: 0 }}>{t("load.computing")} {p("The lookahead solves one MILP per scenario per day, so this takes 10–60 s.", "La anticipación resuelve un MILP por escenario por día, así que tarda 10–60 s.")}</p>}
      </Panel>

      {runErr && <ErrorBox msg={runErr} />}

      <div className="loading-veil" data-busy={busy}>
        <div className="veil-content">
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", margin: "1.6rem 0 0" }}>
            <span className="chip">{live ? t("dash.livelabel") : t("dash.prelabel")}</span>
            <span className="chip">{num(shown.seeds.n_eval, lang)} {p("scenarios", "escenarios")}</span>
            {live && live.seconds !== undefined && (
              <span className="chip">{live.seconds.toFixed(0)} s</span>
            )}
            {shown.rl.included && shown.rl.ood && <span className="chip warn">RL: {t("ood.flag")}</span>}
            {!shown.rl.included && <span className="chip warn">RL: {t("ood.excluded")}</span>}
          </div>
          {live && !sameMarketStudy(live, market) && (
            <p className="small" style={{ color: "var(--amber-ink)" }}>
              {p("Inputs changed since this run. Press “Run simulation” to update.", "Las entradas cambiaron desde esta corrida. Presiona “Correr simulación” para actualizar.")}
            </p>
          )}
          <Ticket study={shown} />
          <ResultsBlock study={shown} />
          <DecisionTool study={shown} market={live ? marketOf(live) : defaults} />
        </div>
      </div>
    </>
  );
}

function marketOf(s: Study): Market {
  const q = s.params;
  return {
    capacity: q.capacity, horizon: q.horizon, price_min: q.price_min, price_max: q.price_max, price_step: q.price_step,
    total_arrivals: q.total_arrivals, demand_sigma: q.demand_sigma, arrival_decay: null, wtp_median: q.wtp_median,
    wtp_sigma: q.wtp_sigma, ref_init: q.ref_init, theta: q.theta, eta: q.eta, gamma: q.gamma, kappa: q.kappa,
  };
}

function sameMarketStudy(s: Study, m: Market) {
  const a = marketOf(s);
  return (Object.keys(m) as (keyof Market)[]).every((k) => k === "arrival_decay" || Math.abs((a[k] as number) - (m[k] as number)) < 1e-9);
}

/* ------------------------------------------------------------------------
   "What do I charge today?" — the recommended decision for a live state.
   ------------------------------------------------------------------------ */
function DecisionTool({ study, market }: { study: Study; market: Market }) {
  const { p, lang, t } = useLang();
  const T = market.horizon;
  const [st, setSt] = useState<DecisionState>({ days_left: Math.min(30, T), seats_left: Math.round(market.capacity * 0.55), ref_price: market.ref_init, last_sales: 40, pace: 1 });
  const [res, setRes] = useState<Decision | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSt((s) => ({ ...s, days_left: Math.min(s.days_left, T), seats_left: Math.min(s.seats_left, market.capacity) }));
  }, [T, market.capacity]);

  const ask = async () => {
    setBusy(true); setErr(null);
    try {
      const pf = study.policies.pfa?.tunables;
      setRes(await api.decide(market, st, {
        fixed_price: study.policies.fixed?.tunables.price as number,
        pfa: pf ? { p0: pf.p0 as number, drift: pf.drift as number, k: pf.k as number } : undefined,
        dla_n0: (study.policies.dla?.tunables.prior_n0 as number | null) ?? null,
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const rec = study.recommendation.policy;
  const set = <K extends keyof DecisionState>(k: K, v: number) => setSt({ ...st, [k]: v });
  const planData = res ? res.dla.plan.map((pr, i) => ({ d: res.days_left - i, price: pr, sales: res.dla.expected_sales[i] })) : [];

  return (
    <>
      <h2>{p("What do I charge today?", "¿Cuánto cobro hoy?")}</h2>
      <p>{p("Already selling? Enter where you stand and get today's price from every policy, plus the lookahead's plan for the rest of the window.",
        "¿Ya estás vendiendo? Indica dónde estás y obtén el precio de hoy según cada política, más el plan de la anticipación para el resto de la ventana.")}</p>
      <Panel>
        <div className="fields">
          <NumberField label={p("Days until the event", "Días para el evento")} value={st.days_left} min={1} max={T} step={1} onChange={(v) => set("days_left", v)} />
          <NumberField label={p("Seats still unsold", "Asientos sin vender")} value={st.seats_left} min={0} max={market.capacity} step={10} onChange={(v) => set("seats_left", v)} />
          <NumberField label={p("Yesterday's price (reference) $", "Precio de ayer (referencia) $")} value={st.ref_price} min={1} max={5000} step={5} onChange={(v) => set("ref_price", v)}
            hint={p("Use a recent average if prices moved.", "Usa un promedio reciente si los precios cambiaron.")} />
          <NumberField label={p("Tickets sold yesterday", "Boletos vendidos ayer")} value={st.last_sales} min={0} max={market.capacity} step={1} onChange={(v) => set("last_sales", v)} />
          <RangeField label={p("Sales vs. expectations so far", "Ventas vs. lo esperado hasta hoy")} value={st.pace} min={0.5} max={2} step={0.05}
            onChange={(v) => set("pace", v)} fmt={(v) => pct(v, lang)}
            hint={p("100% = selling exactly as forecast.", "100% = vendiendo justo como se pronosticó.")} />
        </div>
        <button className="btn" style={{ marginTop: "0.8rem" }} onClick={ask} disabled={busy}>
          {busy ? <><span className="spinner" aria-hidden /> …</> : p("Get today's price", "Obtener el precio de hoy")}
        </button>
        {err && <p className="small" style={{ color: "var(--rose)" }}>{err}</p>}
        {res && (
          <div style={{ marginTop: "1.2rem" }}>
            <div className="scrollx">
              <table className="t">
                <thead><tr><th>{t("m.policy")}</th><th>{p("Price today", "Precio hoy")}</th><th>{p("Note", "Nota")}</th></tr></thead>
                <tbody>
                  {(["fixed", "pfa", "dla", "rl"] as const).map((k) => (
                    <tr key={k} className={k === rec ? "rec" : undefined}>
                      <td><PolicyName k={k} rec={k === rec} /></td>
                      <td><strong className="display-num" style={{ fontSize: "1.3rem" }}>{res[k].price === null ? "—" : money(res[k].price, lang)}</strong></td>
                      <td style={{ whiteSpace: "normal", textAlign: "right" }} className="small muted">
                        {k === "pfa" && p(`booking-curve target: ${num(res.pfa.booking_curve_target, lang)} sold by today`, `objetivo de la curva: ${num(res.pfa.booking_curve_target, lang)} vendidos a hoy`)}
                        {k === "dla" && p(`expects ${kMoney(res.dla.expected_revenue, lang)} more; demand belief ×${res.dla.demand_level_belief.toFixed(2)}`, `espera ${kMoney(res.dla.expected_revenue, lang)} más; creencia de demanda ×${res.dla.demand_level_belief.toFixed(2)}`)}
                        {k === "rl" && (res.rl.price === null ? t("ood.excluded") : res.rl.ood ? t("ood.flag") : "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>{p("Lookahead plan for the remaining days", "Plan de anticipación para los días restantes")}</h3>
            <p className="small muted">{p("Only today's price is applied; tomorrow the plan is re-solved with the new sales.", "Solo se aplica el precio de hoy; mañana el plan se vuelve a resolver con las nuevas ventas.")}</p>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={planData} margin={{ left: 4, right: 8, top: 8, bottom: 18 }}>
                <CartesianGrid stroke="var(--rule)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 12, fill: "var(--ink-muted)" }} stroke="var(--ink-muted)"
                  label={{ value: t("chart.daysleft"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: "var(--ink-muted)" } }} />
                <YAxis yAxisId="p" tick={{ fontSize: 12, fill: "var(--ink-muted)" }} stroke="var(--ink-muted)" width={46} tickFormatter={(v: number) => `$${v}`} domain={["auto", "auto"]} />
                <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 12, fill: "var(--ink-muted)" }} stroke="var(--ink-muted)" width={40} />
                <Tooltip contentStyle={{ background: "var(--paper-raised)", border: "1px solid var(--rule-strong)", borderRadius: 6, fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar yAxisId="s" dataKey="sales" name={p("Expected tickets sold", "Boletos esperados")} fill="var(--violet)" opacity={0.3} isAnimationActive={false} />
                <Line yAxisId="p" dataKey="price" name={p("Planned price", "Precio planeado")} stroke="var(--violet)" type="stepAfter" dot={false} strokeWidth={2.4} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </>
  );
}
