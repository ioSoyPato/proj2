import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Scatter, Tooltip, XAxis, YAxis, BarChart,
} from "recharts";
import type { PolicyKey, Study, Summary, SweepRow } from "../lib/api";
import { useLang } from "../lib/i18n";
import { kMoney, money, num, pct } from "../lib/format";
import { POLICY_COLOR, PolicyName } from "./ui";

const GRID = "var(--rule)";
const AXIS = "var(--ink-muted)";
const tick = { fontSize: 12, fill: "var(--ink-muted)", fontFamily: "Atkinson Hyperlegible, sans-serif" };
const tipStyle = {
  background: "var(--paper-raised)", border: "1px solid var(--rule-strong)", borderRadius: 6,
  fontSize: 13, color: "var(--ink)",
};
const legendStyle = { fontSize: 13, paddingTop: 6 };

function usePolicyLabel() {
  const { t } = useLang();
  return (k: string) => (["fixed", "pfa", "dla", "rl"].includes(k) ? t(`policy.${k as PolicyKey}`) : k);
}

/* --------------------------------------------------------------- prices -- */
export function PricePaths({ study, keys, band, plan, height = 300 }: {
  study: Study; keys: PolicyKey[]; band?: PolicyKey; plan?: number[]; height?: number;
}) {
  const { t, lang } = useLang();
  const label = usePolicyLabel();
  const T = study.params.horizon;
  const data = Array.from({ length: T }, (_, i) => {
    const row: Record<string, number | [number, number] | undefined> = { d: T - i };
    for (const k of keys) row[k] = study.policies[k]?.summary.price_path.mean[i];
    if (band && study.policies[band]) {
      const s = study.policies[band]!.summary.price_path;
      row.band = [s.p10[i], s.p90[i]];
    }
    if (plan) row.plan = plan[i];
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="d" tick={tick} stroke={AXIS} interval={Math.max(0, Math.round(T / 8) - 1)}
          label={{ value: t("chart.daysleft"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis tick={tick} stroke={AXIS} width={48} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${v}`} />
        <Tooltip contentStyle={tipStyle} labelFormatter={(d) => `${d} ${t("unit.days")}`}
          formatter={(v: unknown, name: string) => Array.isArray(v) ? [`${money(v[0], lang)} – ${money(v[1], lang)}`, name] : [money(v as number, lang, 1), name]} />
        <Legend wrapperStyle={legendStyle} />
        {band && <Area dataKey="band" name={`${label(band)} · ${t("chart.band")}`} stroke="none"
          fill={POLICY_COLOR[band]} fillOpacity={0.14} isAnimationActive={false} legendType="square" />}
        {keys.map((k) => (
          <Line key={k} dataKey={k} name={label(k)} stroke={POLICY_COLOR[k]} dot={false}
            strokeWidth={k === band ? 2.8 : 1.8} type="stepAfter" isAnimationActive={false} />
        ))}
        {plan && <Line dataKey="plan" name={t("chart.plan")} stroke="var(--amber)" strokeDasharray="5 4" dot={false}
          strokeWidth={2} type="stepAfter" isAnimationActive={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function SeatsPaths({ study, keys, height = 240 }: { study: Study; keys: PolicyKey[]; height?: number }) {
  const { t, lang } = useLang();
  const label = usePolicyLabel();
  const T = study.params.horizon;
  const data = Array.from({ length: T }, (_, i) => {
    const row: Record<string, number | undefined> = { d: T - i };
    for (const k of keys) row[k] = study.policies[k]?.summary.seats_path.mean[i];
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="d" tick={tick} stroke={AXIS} interval={Math.max(0, Math.round(T / 8) - 1)}
          label={{ value: t("chart.daysleft"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis tick={tick} stroke={AXIS} width={48} />
        <ReferenceLine y={study.params.capacity * study.params.scarcity_frac} stroke="var(--rose)" strokeDasharray="3 3" />
        <Tooltip contentStyle={tipStyle} labelFormatter={(d) => `${d} ${t("unit.days")}`}
          formatter={(v: number, n: string) => [num(v, lang), n]} />
        <Legend wrapperStyle={legendStyle} />
        {keys.map((k) => (
          <Line key={k} dataKey={k} name={label(k)} stroke={POLICY_COLOR[k]} dot={false} strokeWidth={2} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------- revenue spread strips -- */
export function RangeStrips({ study, keys, rec }: { study: Study; keys: PolicyKey[]; rec?: PolicyKey }) {
  const { lang, p } = useLang();
  const sums = keys.map((k) => study.policies[k]!.summary);
  const lo = Math.min(...sums.map((s) => s.revenue.p5));
  const hi = Math.max(...sums.map((s) => s.revenue.p95));
  const pad = (hi - lo) * 0.06;
  const x = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  return (
    <div>
      {keys.map((k, i) => {
        const s = sums[i].revenue;
        return (
          <div className="strip-row" key={k}>
            <div className="nm"><PolicyName k={k} rec={k === rec} /></div>
            <svg viewBox="0 0 100 24" preserveAspectRatio="none" style={{ width: "100%", height: 30, overflow: "visible" }}
              role="img" aria-label={`${s.p5.toFixed(0)}–${s.p95.toFixed(0)}`}>
              <line x1={x(s.p5)} x2={x(s.p95)} y1={12} y2={12} stroke={POLICY_COLOR[k]} strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={0.55} />
              <rect x={x(s.p25)} width={Math.max(0.4, x(s.p75) - x(s.p25))} y={6} height={12} fill={POLICY_COLOR[k]} opacity={0.35} rx={1} />
              <line x1={x(s.mean)} x2={x(s.mean)} y1={2} y2={22} stroke={POLICY_COLOR[k]} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        );
      })}
      <div className="strip-row small muted" style={{ paddingTop: 0 }}>
        <div />
        <div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{kMoney(lo - pad, lang)}</span>
            <span>{kMoney(hi + pad, lang)}</span>
          </div>
          <div style={{ marginTop: "0.3rem" }}>{p("Thin line: P5–P95. Box: P25–P75. Bar: mean.", "Línea: P5–P95. Caja: P25–P75. Barra: media.")}</div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- sell-out bars -- */
export function SelloutBars({ study, keys }: { study: Study; keys: PolicyKey[] }) {
  const { lang, p } = useLang();
  return (
    <div>
      {keys.map((k) => {
        const s: Summary = study.policies[k]!.summary;
        const [a, b] = s.sellout.ci95;
        return (
          <div className="strip-row" key={k}>
            <div className="nm"><PolicyName k={k} /></div>
            <div style={{ position: "relative", height: 26, background: "var(--paper-sunk)", borderRadius: 4 }}>
              <div style={{ position: "absolute", inset: 0, width: `${s.sellout.prob * 100}%`, background: POLICY_COLOR[k], opacity: 0.8, borderRadius: 4 }} />
              <div title="95% CI" style={{ position: "absolute", bottom: 0, height: 4, left: `${a * 100}%`, width: `${Math.max(0.3, (b - a) * 100)}%`, background: "var(--ink)", opacity: 0.55 }} />
              <span className="num" style={{ position: "absolute", right: 8, top: 3, fontSize: 13, fontWeight: 700 }}>
                {pct(s.sellout.prob, lang)}
              </span>
            </div>
          </div>
        );
      })}
      <p className="small muted" style={{ marginTop: "0.4rem" }}>
        {p("Dark strip along the bottom: 95% Wilson interval.", "Franja oscura inferior: intervalo de Wilson al 95%.")}
      </p>
    </div>
  );
}

/* --------------------------------------------------- revenue histogram -- */
export function RevenueHistogram({ study, keys, height = 260 }: { study: Study; keys: PolicyKey[]; height?: number }) {
  const { t, lang } = useLang();
  const label = usePolicyLabel();
  const first = study.policies[keys[0]]!.summary.histogram;
  const data = first.counts.map((_, i) => {
    const row: Record<string, number> = { x: (first.edges[i] + first.edges[i + 1]) / 2 };
    for (const k of keys) row[k] = study.policies[k]!.summary.histogram.counts[i];
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tick={tick} stroke={AXIS}
          tickFormatter={(v: number) => kMoney(v, lang, 0)}
          label={{ value: t("chart.revenue"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis tick={tick} stroke={AXIS} width={36} />
        <Tooltip contentStyle={tipStyle} labelFormatter={(v: number) => kMoney(v, lang)} />
        <Legend wrapperStyle={legendStyle} />
        {keys.map((k) => (
          <Line key={k} dataKey={k} name={label(k)} type="step" stroke={POLICY_COLOR[k]} dot={false} strokeWidth={2} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------- sensitivity -- */
export function SweepChart({ rows, keys, xLabel, height = 280, fmtX }: {
  rows: SweepRow[]; keys: PolicyKey[]; xLabel: string; height?: number; fmtX?: (v: number) => string;
}) {
  const { lang } = useLang();
  const label = usePolicyLabel();
  const data = rows.map((r) => {
    const row: Record<string, number | undefined> = { x: r.value };
    for (const k of keys) row[k] = r.policies[k]?.mean;
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 4, right: 14, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="x" tick={tick} stroke={AXIS} tickFormatter={fmtX}
          label={{ value: xLabel, position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis tick={tick} stroke={AXIS} width={52} tickFormatter={(v: number) => kMoney(v, lang, 0)} domain={["auto", "auto"]} />
        <Tooltip contentStyle={tipStyle} formatter={(v: number, n: string) => [kMoney(v, lang), n]}
          labelFormatter={(v) => `${xLabel}: ${fmtX ? fmtX(v as number) : v}`} />
        <Legend wrapperStyle={legendStyle} />
        {keys.map((k) => (
          <Line key={k} dataKey={k} name={label(k)} stroke={POLICY_COLOR[k]} strokeWidth={2}
            strokeDasharray={k === "rl" ? "4 3" : undefined} dot={{ r: 3 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* --------------------------------------------------------- misc small -- */
export function FixedCurve({ study, height = 240 }: { study: Study; height?: number }) {
  const { lang, p } = useLang();
  const best = study.policies.fixed?.tunables.price as number;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={study.fixed_price_curve} margin={{ left: 4, right: 12, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="price" tick={tick} stroke={AXIS} tickFormatter={(v: number) => `$${v}`}
          label={{ value: p("Fixed price for all days", "Precio fijo para todos los días"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis yAxisId="r" tick={tick} stroke={AXIS} width={52} tickFormatter={(v: number) => kMoney(v, lang, 0)} />
        <YAxis yAxisId="s" orientation="right" tick={tick} stroke={AXIS} width={40} domain={[0, 1]} tickFormatter={(v: number) => pct(v, lang)} />
        <Tooltip contentStyle={tipStyle} labelFormatter={(v) => `$${v}`}
          formatter={(v: number, n: string) => [n.includes("%") || n.toLowerCase().includes("sell") || n.toLowerCase().includes("agot") ? pct(v, lang) : kMoney(v, lang), n]} />
        <Legend wrapperStyle={legendStyle} />
        <Bar yAxisId="r" dataKey="mean_revenue" name={p("Mean revenue (tuning seeds)", "Ingreso medio (semillas de ajuste)")} fill="var(--c-fixed)" opacity={0.75} isAnimationActive={false} />
        <Line yAxisId="s" dataKey="sellout_prob" name={p("Sell-out probability", "Probabilidad de agotar")} stroke="var(--rose)" dot={false} strokeWidth={2} isAnimationActive={false} />
        <ReferenceLine yAxisId="r" x={best} stroke="var(--amber)" strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function LearningCurve({ history, height = 220 }: { history: { episodes: number; val_revenue: number }[]; height?: number }) {
  const { lang, p } = useLang();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={history} margin={{ left: 4, right: 12, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="episodes" tick={tick} stroke={AXIS} tickFormatter={(v: number) => num(v, lang)}
          label={{ value: p("Training episodes", "Episodios de entrenamiento"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis tick={tick} stroke={AXIS} width={52} tickFormatter={(v: number) => kMoney(v, lang, 0)} />
        <Tooltip contentStyle={tipStyle} formatter={(v: number) => kMoney(v, lang)} />
        <Line dataKey="val_revenue" name={p("Greedy revenue on validation seeds", "Ingreso codicioso en semillas de validación")} stroke="var(--c-rl)" dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ArrivalCurve({ rates, height = 200 }: { rates: number[]; height?: number }) {
  const { t, lang, p } = useLang();
  const T = rates.length;
  const data = rates.map((r, i) => ({ d: T - i, r }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="d" tick={tick} stroke={AXIS} interval={Math.max(0, Math.round(T / 8) - 1)}
          label={{ value: t("chart.daysleft"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis tick={tick} stroke={AXIS} width={40} />
        <Tooltip contentStyle={tipStyle} labelFormatter={(d) => `${d} ${t("unit.days")}`}
          formatter={(v: number) => [num(v, lang, 1), p("expected buyers", "compradores esperados")]} />
        <Bar dataKey="r" fill="var(--violet)" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CalibrationFit({ d, y, fitted, height = 280 }: { d: number[]; y: number[]; fitted: number[]; height?: number }) {
  const { t, p } = useLang();
  const data = d.map((dd, i) => ({ d: dd, y: y[i], f: fitted[i] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="d" type="number" reversed tick={tick} stroke={AXIS} domain={[0, 60]}
          label={{ value: t("chart.daysleft"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis tick={tick} stroke={AXIS} width={44} />
        <Tooltip contentStyle={tipStyle} />
        <Legend wrapperStyle={legendStyle} />
        <Scatter dataKey="y" name={p("Observed booking proxy (seats/day)", "Proxy de reservas observado (asientos/día)")} fill="var(--violet)" isAnimationActive={false} />
        <Line dataKey="f" name="a·exp(−b·d)" stroke="var(--amber)" dot={false} strokeWidth={2.5} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function FareCurve({ d, fare, height = 220 }: { d: number[]; fare: (number | null)[]; height?: number }) {
  const { t, lang } = useLang();
  const data = d.map((dd, i) => ({ d: dd, f: fare[i] ?? undefined }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="d" type="number" reversed tick={tick} stroke={AXIS} domain={[0, 60]}
          label={{ value: t("chart.daysleft"), position: "insideBottom", offset: -10, style: { fontSize: 12, fill: AXIS } }} />
        <YAxis tick={tick} stroke={AXIS} width={52} tickFormatter={(v: number) => `$${v.toFixed(0)}`} domain={["auto", "auto"]} />
        <Tooltip contentStyle={tipStyle} formatter={(v: number) => money(v, lang)} labelFormatter={(v) => `${v} ${t("unit.days")}`} />
        <Line dataKey="f" name="totalFare" stroke="var(--teal)" dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
