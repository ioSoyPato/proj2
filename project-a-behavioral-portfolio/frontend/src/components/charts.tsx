import { useMemo, useState } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import type { Analysis, PolicyKey, Holding, FrontierPoint } from "../lib/api";
import { CLASS_NAMES, POLICY_NAMES, useLang, usePick } from "../lib/i18n";
import { useFmt } from "./ui";

export const policyColor = (k: PolicyKey | string) => `var(--p-${k})`;
export const CLASS_ORDER = ["US equity", "US sectors", "International equity", "Real estate", "Government bonds", "Credit", "Commodities", "Cash"];
export const classColor = (c: string) => `var(--c${CLASS_ORDER.indexOf(c) + 1})`;

const axis = { fontSize: 11.5, fill: "var(--ink-muted)", fontFamily: "Schibsted Grotesk, sans-serif" };
const tipStyle = {
  contentStyle: { background: "var(--paper-raised)", border: "1px solid var(--rule-strong)", fontSize: 12.5, borderRadius: 6, color: "var(--ink)" },
  labelStyle: { color: "var(--ink-soft)", fontWeight: 600 },
  itemStyle: { color: "var(--ink)" },
};
const legendStyle = { fontSize: 12.5, color: "var(--ink-soft)", paddingTop: 6 };

// ------------------------------------------------------------------
// Value function: custom SVG (the signature figure of the app)
// ------------------------------------------------------------------
export function ValueFunction({
  x, v, height = 320, compact = false, title,
}: { x: number[]; v: number[]; height?: number; compact?: boolean; title?: string }) {
  const { tx } = useLang();
  const { num } = useFmt();
  const [hover, setHover] = useState<number | null>(null);
  const W = 520, H = 360, pad = compact ? 18 : 36;
  const vmin = Math.min(...v, -0.5), vmax = Math.max(...v, 0.5);
  const sx = (xx: number) => pad + ((xx - x[0]) / (x[x.length - 1] - x[0])) * (W - 2 * pad);
  const sy = (vv: number) => pad + ((vmax - vv) / (vmax - vmin)) * (H - 2 * pad);
  const mid = x.findIndex((xx) => xx >= 0);
  const path = (from: number, to: number) =>
    x.slice(from, to).map((xx, i) => `${i === 0 ? "M" : "L"}${sx(xx).toFixed(1)},${sy(v[from + i]).toFixed(1)}`).join(" ");
  const lossPath = path(0, mid + 1);
  const gainPath = path(mid, x.length);
  const neutral = `M${sx(x[0])},${sy(x[0])} L${sx(x[x.length - 1])},${sy(x[x.length - 1])}`;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const xx = x[0] + ((px - pad) / (W - 2 * pad)) * (x[x.length - 1] - x[0]);
    let best = 0;
    x.forEach((q, i) => { if (Math.abs(q - xx) < Math.abs(x[best] - xx)) best = i; });
    setHover(best);
  };

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: "auto", maxHeight: height, display: "block", touchAction: "none" }}
        role="img" aria-label={title ?? tx("Prospect-theory value function", "Función de valor de la teoría prospectiva")}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
      >
        <line x1={pad} x2={W - pad} y1={sy(0)} y2={sy(0)} stroke="var(--rule-strong)" />
        <line x1={sx(0)} x2={sx(0)} y1={pad} y2={H - pad} stroke="var(--rule-strong)" />
        <path d={neutral} stroke="var(--ink-muted)" strokeDasharray="3 5" fill="none" strokeWidth={1.2} />
        <path d={lossPath} stroke="var(--loss)" strokeWidth={compact ? 3 : 3.5} fill="none" strokeLinecap="round" />
        <path d={gainPath} stroke="var(--gain)" strokeWidth={compact ? 3 : 3.5} fill="none" strokeLinecap="round" />
        <circle cx={sx(0)} cy={sy(0)} r={5} fill="var(--paper-raised)" stroke="var(--ink)" strokeWidth={2} />
        {!compact && (
          <>
            <text x={W - pad} y={sy(0) + 18} textAnchor="end" className="kink-label">{tx("gain vs reference →", "ganancia vs referencia →")}</text>
            <text x={pad} y={sy(0) - 10} className="kink-label">{tx("← loss", "← pérdida")}</text>
            <text x={sx(0) + 10} y={pad + 4} className="kink-label">{tx("felt value v(x)", "valor percibido v(x)")}</text>
            <text x={sx(x[8])} y={sy(x[8]) - 10} className="kink-label" style={{ fill: "var(--ink-muted)" }}>{tx("loss-neutral", "neutral a pérdidas")}</text>
          </>
        )}
        {hover !== null && (
          <g>
            <line x1={sx(x[hover])} x2={sx(x[hover])} y1={pad} y2={H - pad} stroke="var(--ink-muted)" strokeDasharray="2 3" />
            <circle cx={sx(x[hover])} cy={sy(v[hover])} r={5.5} fill={x[hover] < 0 ? "var(--loss)" : "var(--gain)"} stroke="var(--paper-raised)" strokeWidth={2} />
            <g transform={`translate(${Math.min(sx(x[hover]) + 10, W - 170)}, ${Math.max(sy(v[hover]) - 46, 8)})`}>
              <rect width={158} height={40} rx={6} fill="var(--paper-raised)" stroke="var(--rule-strong)" />
              <text x={10} y={17} style={{ fontSize: 12, fill: "var(--ink-soft)" }}>x = {num(x[hover] * 100, 0)}%</text>
              <text x={10} y={32} style={{ fontSize: 12, fill: "var(--ink)", fontWeight: 600 }}>v(x) = {num(v[hover], 3)}</text>
            </g>
          </g>
        )}
      </svg>
    </figure>
  );
}

// ------------------------------------------------------------------
// Portfolio weights
// ------------------------------------------------------------------
export function WeightsChart({ holdings }: { holdings: Holding[] }) {
  const { pct } = useFmt();
  const pick = usePick();
  const data = holdings.map((h) => ({ name: h.ticker, w: h.weight * 100, cls: h.asset_class, full: h.name }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 40, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="var(--rule)" horizontal={false} />
        <XAxis type="number" tick={axis} stroke="var(--rule-strong)" domain={[0, (m: number) => Math.ceil(m / 5) * 5]} tickFormatter={(v: number) => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ ...axis, fill: "var(--ink)", fontSize: 12.5 }} width={44} stroke="var(--rule-strong)" />
        <Tooltip
          {...tipStyle}
          cursor={{ fill: "var(--paper-sunk)" }}
          formatter={(val: number, _n, p) => [pct(val / 100), `${p.payload.full} (${pick(CLASS_NAMES[p.payload.cls], p.payload.cls)})`]}
        />
        <Bar dataKey="w" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: "right", fill: "var(--ink-soft)", fontSize: 11.5, formatter: (v: number) => `${v.toFixed(1)}%` }}>
          {data.map((d, i) => <Cell key={i} fill={classColor(d.cls)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ClassStrip({ byClass }: { byClass: { asset_class: string; weight: number }[] }) {
  const pick = usePick();
  const { pct } = useFmt();
  return (
    <div>
      <div style={{ display: "flex", height: 16, borderRadius: 5, overflow: "hidden", gap: 2 }}>
        {byClass.map((c) => (
          <div key={c.asset_class} title={`${pick(CLASS_NAMES[c.asset_class], c.asset_class)} ${pct(c.weight)}`}
            style={{ width: `${c.weight * 100}%`, background: classColor(c.asset_class) }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem 1rem", marginTop: "0.55rem", fontSize: "0.82rem" }}>
        {byClass.map((c) => (
          <span key={c.asset_class}>
            <span className="swatch" style={{ background: classColor(c.asset_class) }} />
            {pick(CLASS_NAMES[c.asset_class], c.asset_class)} <strong className="num">{pct(c.weight, 0)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Fan chart of wealth paths
// ------------------------------------------------------------------
export function FanChart({ a, policy, compare }: { a: Analysis; policy: PolicyKey; compare?: PolicyKey }) {
  const { tx } = useLang();
  const pick = usePick();
  const { kmoney } = useFmt();
  const fan = a.evaluation.policies[policy].fan;
  const cmp = compare ? a.evaluation.policies[compare].fan : null;
  const data = fan.p50.map((_, t) => ({
    year: t / 12,
    outer: [fan.p5[t], fan.p95[t]] as [number, number],
    inner: [fan.p25[t], fan.p75[t]] as [number, number],
    median: fan.p50[t],
    cmp: cmp ? cmp.p50[t] : undefined,
  }));
  const col = policyColor(policy);
  return (
    <ResponsiveContainer width="100%" height={330}>
      <ComposedChart data={data} margin={{ left: 6, right: 14, top: 10, bottom: 4 }}>
        <CartesianGrid stroke="var(--rule)" vertical={false} />
        <XAxis dataKey="year" type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={axis} stroke="var(--rule-strong)"
          tickFormatter={(v) => `${v}${tx("y", "a")}`} />
        <YAxis tick={axis} stroke="var(--rule-strong)" tickFormatter={kmoney} width={54} />
        <ReferenceLine y={a.settings.reference} stroke="var(--ink-muted)" strokeDasharray="4 4"
          label={{ value: tx("reference", "referencia"), position: "insideTopLeft", fill: "var(--ink-muted)", fontSize: 11 }} />
        <Tooltip
          {...tipStyle}
          labelFormatter={(v: number) => `${tx("Year", "Año")} ${Number(v).toFixed(1)}`}
          formatter={(val: number | [number, number], name: string) =>
            Array.isArray(val) ? [`${kmoney(val[0])} – ${kmoney(val[1])}`, name] : [kmoney(val), name]}
        />
        <Legend wrapperStyle={legendStyle} />
        <Area dataKey="outer" name={tx("5th–95th percentile", "Percentil 5–95")} stroke="none" fill={col} fillOpacity={0.14} isAnimationActive={false} />
        <Area dataKey="inner" name={tx("25th–75th percentile", "Percentil 25–75")} stroke="none" fill={col} fillOpacity={0.3} isAnimationActive={false} />
        <Line dataKey="median" name={`${tx("Median", "Mediana")}: ${pick(POLICY_NAMES[policy])}`} stroke={col} strokeWidth={2.4} dot={false} isAnimationActive={false} />
        {compare && (
          <Line dataKey="cmp" name={`${tx("Median", "Mediana")}: ${pick(POLICY_NAMES[compare])}`} stroke={policyColor(compare)} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------
// Terminal-wealth distribution (overlaid step lines)
// ------------------------------------------------------------------
export function TerminalHistogram({ a, policies }: { a: Analysis; policies: PolicyKey[] }) {
  const pick = usePick();
  const { tx } = useLang();
  const { kmoney } = useFmt();
  const { edges, counts } = a.evaluation.histogram;
  const data = edges.slice(0, -1).map((e, i) => {
    const row: Record<string, number> = { x: (e + edges[i + 1]) / 2 };
    policies.forEach((k) => { row[k] = counts[k][i]; });
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 0, right: 14, top: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--rule)" vertical={false} />
        <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tick={axis} stroke="var(--rule-strong)" tickFormatter={kmoney} />
        <YAxis tick={axis} stroke="var(--rule-strong)" width={34} />
        <ReferenceLine x={a.settings.reference} stroke="var(--ink-muted)" strokeDasharray="4 4" />
        <Tooltip {...tipStyle} labelFormatter={(v: number) => `${tx("Terminal wealth ≈", "Riqueza final ≈")} ${kmoney(v)}`}
          formatter={(v: number, n: string) => [`${v} ${tx("scenarios", "escenarios")}`, n]} />
        <Legend wrapperStyle={legendStyle} />
        {policies.map((k) => (
          <Line key={k} type="stepAfter" dataKey={k} name={pick(POLICY_NAMES[k])} stroke={policyColor(k)} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------
// Interval plot (point + 95% CI), used for behaviour costs and PT means
// ------------------------------------------------------------------
export function IntervalPlot({
  rows, format, zeroLabel, includeZero = true,
}: { rows: { key: string; label: string; color: string; mean: number; lo: number; hi: number }[]; format: (x: number) => string; zeroLabel?: string; includeZero?: boolean }) {
  const rawLo = Math.min(...rows.map((r) => r.lo), includeZero ? 0 : Infinity);
  const rawHi = Math.max(...rows.map((r) => r.hi), includeZero ? 0 : -Infinity);
  const padv = includeZero ? 0 : (rawHi - rawLo) * 0.08;
  const lo = rawLo - padv, hi = rawHi + padv;
  const span = hi - lo || 1;
  const W = 600, rowH = 46, left = 170, right = 24;
  const sx = (v: number) => left + ((v - lo) / span) * (W - left - right);
  const H = rows.length * rowH + 30;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: "block", maxHeight: H * 1.3 }}>
      {includeZero && <line x1={sx(0)} x2={sx(0)} y1={6} y2={H - 22} stroke="var(--ink-muted)" strokeDasharray="3 4" />}
      {zeroLabel && <text x={sx(0)} y={H - 6} textAnchor="middle" style={{ fontSize: 11, fill: "var(--ink-muted)" }}>{zeroLabel}</text>}
      {rows.map((r, i) => {
        const y = 22 + i * rowH;
        return (
          <g key={r.key}>
            <title>{`${r.label}: ${format(r.mean)} (95% CI ${format(r.lo)} to ${format(r.hi)})`}</title>
            <text x={0} y={y + 4} style={{ fontSize: 13, fill: "var(--ink)" }}>{r.label}</text>
            <line x1={sx(r.lo)} x2={sx(r.hi)} y1={y} y2={y} stroke={r.color} strokeWidth={3} strokeLinecap="round" />
            <circle cx={sx(r.mean)} cy={y} r={7} fill={r.color} stroke="var(--paper-raised)" strokeWidth={2} />
            <text x={sx(r.mean)} y={y + 22} textAnchor="middle" style={{ fontSize: 12, fill: "var(--ink-soft)", fontWeight: 600 }}>{format(r.mean)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------
// Tuning curve, frontier, sensitivity
// ------------------------------------------------------------------
export function BandTuning({ a }: { a: Analysis }) {
  const { tx } = useLang();
  const { num } = useFmt();
  const rows = a.tuning.band_grid.filter((r) => r.band !== null).map((r) => ({ b: (r.band as number) * 100, pt: r.mean_pt }));
  const bh = a.tuning.band_grid.find((r) => r.band === null);
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={rows} margin={{ left: 0, right: 16, top: 10, bottom: 14 }}>
        <CartesianGrid stroke="var(--rule)" vertical={false} />
        <XAxis dataKey="b" type="number" unit="%" tick={axis} stroke="var(--rule-strong)"
          label={{ value: tx("band width b (drift that triggers a rebalance)", "ancho de banda b (desvío que dispara el rebalanceo)"), position: "insideBottom", offset: -8, fill: "var(--ink-muted)", fontSize: 11 }} />
        <YAxis tick={axis} stroke="var(--rule-strong)" domain={["auto", "auto"]} width={44} tickFormatter={(v) => num(v, 2)} />
        <Tooltip {...tipStyle} labelFormatter={(v: number) => `b = ${v}%`} formatter={(v: number) => [num(v, 4), tx("mean PT value (tuning seed)", "valor PT medio (semilla de calibración)")]} />
        {bh && <ReferenceLine y={bh.mean_pt} stroke="var(--p-buy_hold)" strokeDasharray="5 4" label={{ value: tx("buy and hold", "comprar y mantener"), fill: "var(--ink-muted)", fontSize: 11, position: "insideBottomRight" }} />}
        <Line dataKey="pt" stroke="var(--p-pfa_band)" strokeWidth={2.2} dot={{ r: 4, fill: "var(--p-pfa_band)" }} isAnimationActive={false} />
        <ReferenceDot x={a.tuning.band_selected * 100} y={rows.find((r) => Math.abs(r.b - a.tuning.band_selected * 100) < 1e-9)?.pt ?? 0} r={8} fill="none" stroke="var(--ink)" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Frontier({ points, client }: { points: FrontierPoint[]; client: { cvar: number; ret: number } }) {
  const { tx } = useLang();
  const { pct } = useFmt();
  const data = points.map((p) => ({ cvar: p.cvar * 100, ret: p.expected_return_annual * 100 }));
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ left: 0, right: 16, top: 10, bottom: 14 }}>
        <CartesianGrid stroke="var(--rule)" />
        <XAxis dataKey="cvar" type="number" unit="%" domain={["dataMin", "dataMax"]} tick={axis} stroke="var(--rule-strong)" tickFormatter={(v) => v.toFixed(1)}
          label={{ value: tx("monthly CVaR 95% (expected loss in the worst 5% of months)", "CVaR mensual 95% (pérdida esperada en el peor 5% de los meses)"), position: "insideBottom", offset: -8, fill: "var(--ink-muted)", fontSize: 11 }} />
        <YAxis unit="%" tick={axis} stroke="var(--rule-strong)" width={44} domain={["auto", "auto"]} tickFormatter={(v) => v.toFixed(0)} />
        <Tooltip {...tipStyle} labelFormatter={(v: number) => `CVaR ${v.toFixed(2)}%`} formatter={(v: number) => [pct(v / 100), tx("historical mean return, annualized", "retorno medio histórico, anualizado")]} />
        <Line dataKey="ret" stroke="var(--ink-soft)" strokeWidth={2} dot={{ r: 3.5 }} isAnimationActive={false} />
        <ReferenceDot x={client.cvar * 100} y={client.ret * 100} r={8} fill="var(--you)" stroke="var(--paper-raised)" strokeWidth={2}
          label={{ value: tx("this client", "este cliente"), position: "top", fill: "var(--ink)", fontSize: 12 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SweepChart({
  rows, xKey, xLabel, xFormat, policies,
}: { rows: { x: number; scores: Record<string, { mean_pt: number; ci_half: number }> }[]; xKey: string; xLabel: string; xFormat: (v: number) => string; policies: PolicyKey[] }) {
  const pick = usePick();
  const { num } = useFmt();
  const data = rows.map((r) => {
    const o: Record<string, number> = { [xKey]: r.x };
    policies.forEach((k) => { o[k] = r.scores[k]?.mean_pt; });
    return o;
  });
  const sorted = useMemo(() => data, [data]);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={sorted} margin={{ left: 0, right: 16, top: 10, bottom: 26 }}>
        <CartesianGrid stroke="var(--rule)" vertical={false} />
        <XAxis dataKey={xKey} type="number" domain={["dataMin", "dataMax"]} tick={axis} stroke="var(--rule-strong)" tickFormatter={xFormat}
          ticks={rows.map((r) => r.x)} label={{ value: xLabel, position: "insideBottom", offset: -18, fill: "var(--ink-muted)", fontSize: 11 }} />
        <YAxis tick={axis} stroke="var(--rule-strong)" width={40} domain={["auto", "auto"]} tickFormatter={(v) => num(v, 1)} />
        <Tooltip {...tipStyle} labelFormatter={(v: number) => xFormat(v)} formatter={(v: number, n: string) => [num(v, 3), n]} />
        <Legend wrapperStyle={{ ...legendStyle, paddingTop: 22 }} />
        {policies.map((k) => (
          <Line key={k} dataKey={k} name={pick(POLICY_NAMES[k])} stroke={policyColor(k)} strokeWidth={2.2} dot={{ r: 3.5, fill: policyColor(k) }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------
// Heat table for the behaviour grids
// ------------------------------------------------------------------
export function HeatTable({
  rowsKey, colsKey, rowVals, colVals, cells, rowLabel, colLabel, fmtRow, fmtCol, highlight,
}: {
  rowsKey: string; colsKey: string; rowVals: number[]; colVals: number[];
  cells: Record<string, number>[]; rowLabel: string; colLabel: string;
  fmtRow: (v: number) => string; fmtCol: (v: number) => string; highlight?: [number, number];
}) {
  const { kmoney } = useFmt();
  const vals = cells.map((c) => c.median_diff);
  const worst = Math.min(...vals, -1);
  const get = (r: number, c: number) => cells.find((x) => Math.abs(x[rowsKey] - r) < 1e-9 && Math.abs(x[colsKey] - c) < 1e-9);
  return (
    <div className="tbl-wrap">
      <table className="tbl" style={{ minWidth: 380 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>{rowLabel} ↓ / {colLabel} →</th>
            {colVals.map((c) => <th key={c}>{fmtCol(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rowVals.map((r) => (
            <tr key={r}>
              <td>{fmtRow(r)}</td>
              {colVals.map((c) => {
                const cell = get(r, c);
                const v = cell ? cell.median_diff : 0;
                const t = Math.min(1, Math.max(0, v / worst));
                const isHl = highlight && Math.abs(highlight[0] - r) < 1e-9 && Math.abs(highlight[1] - c) < 1e-9;
                return (
                  <td key={c} style={{
                    background: `color-mix(in oklab, var(--loss) ${Math.round(t * 70)}%, var(--paper-raised))`,
                    color: t > 0.55 ? "#fff" : "var(--ink)", fontWeight: isHl ? 800 : 500,
                    outline: isHl ? "2px solid var(--you)" : undefined, outlineOffset: -2,
                  }} title={cell ? `mean ${kmoney(cell.mean_diff)}` : ""}>
                    {kmoney(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
