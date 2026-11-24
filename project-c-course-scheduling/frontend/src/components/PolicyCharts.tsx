import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ChartFrame, axis, grid, tooltipStyle } from "./charts";
import { useI18n } from "../lib/i18n";
import { kmoney, money, num } from "../lib/format";
import type { PolicyName, PolicyResult } from "../lib/api";

/** Cost vs. students without a seat: policy means (big), scenario cloud (faint), optional extra points. */
export function FrontierChart({ policies, scenarios, extra, height = 380 }: {
  policies: PolicyResult[];
  scenarios?: Record<string, { total_cost: number[]; unserved: number[] }>;
  extra?: { name: string; points: { x: number; y: number; label: string }[]; color: string }[];
  height?: number;
}) {
  const { t, d, lang } = useI18n();
  // clip the view at the 95th percentile so a handful of extreme scenarios don't squash the means
  const xMax = Math.ceil(Math.max(...policies.map((p) => p.stats.unserved.p95), ...(extra ?? []).flatMap((e) => e.points.map((q) => q.x))) * 1.05);
  const yMax = Math.max(...policies.map((p) => p.stats.total_cost.p95), ...(extra ?? []).flatMap((e) => e.points.map((q) => q.y))) * 1.03;
  const yMin = Math.min(...policies.map((p) => p.stats.total_cost.p5)) * 0.97;
  return (
    <ChartFrame height={height} note={t("Axes are clipped at the 95th percentile; a few extreme scenarios fall outside the view.", "Los ejes se recortan en el percentil 95; algunos escenarios extremos quedan fuera de la vista.")}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 10 }}>
          <CartesianGrid {...grid} />
          <XAxis type="number" dataKey="x" name={d("m.unserved")} {...axis} domain={[0, xMax]} allowDataOverflow label={{ value: d("m.unserved"), position: "insideBottom", offset: -12, fill: "var(--ink-muted)", fontSize: 12 }} />
          <YAxis type="number" dataKey="y" name={d("m.total_cost")} {...axis} tickFormatter={(v) => kmoney(v, lang)} width={70} domain={[Math.floor(yMin / 5000) * 5000, Math.ceil(yMax / 5000) * 5000]} allowDataOverflow />
          <ZAxis type="number" dataKey="z" range={[14, 220]} />
          <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3" }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as { x: number; y: number; label?: string } | undefined;
              if (!p) return null;
              return <div style={{ ...tooltipStyle.contentStyle, padding: "0.4rem 0.6rem" }}>{p.label && <div><strong>{p.label}</strong></div>}<div>{money(p.y, lang)}</div><div>{num(p.x, lang, 1)} {t("without a seat", "sin lugar")}</div></div>;
            }} />
          {scenarios && policies.map((p) => (
            <Scatter key={`c-${p.name}`} data={scenarios[p.name].total_cost.slice(0, 250).map((y, i) => ({ x: scenarios[p.name].unserved[i], y, z: 14 }))}
              fill={`var(--p-${p.name})`} fillOpacity={0.12} isAnimationActive={false} legendType="none" />
          ))}
          {extra?.map((e) => (
            <Scatter key={e.name} name={e.name} data={e.points.map((p) => ({ ...p, z: 50 }))} fill="transparent" stroke={e.color} isAnimationActive={false} />
          ))}
          {policies.map((p) => (
            <Scatter key={p.name} name={d(`policy.short.${p.name}` as never)} isAnimationActive={false}
              data={[{ x: p.stats.unserved.mean, y: p.stats.total_cost.mean, z: 220, label: d(`policy.${p.name}` as never) }]}
              fill={`var(--p-${p.name})`} stroke="var(--raised)" strokeWidth={2} />
          ))}
          <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 12 }} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function HistogramChart({ policies, scenarios, height = 280 }: {
  policies: PolicyName[]; scenarios: Record<string, { total_cost: number[] }>; height?: number;
}) {
  const { d, lang } = useI18n();
  const all = policies.flatMap((p) => scenarios[p].total_cost);
  const lo = Math.min(...all), hi = Math.max(...all);
  const nb = 28, w = (hi - lo) / nb || 1;
  const data = Array.from({ length: nb }, (_, i) => {
    const row: Record<string, number> = { x: lo + (i + 0.5) * w };
    for (const p of policies) {
      const v = scenarios[p].total_cost;
      row[p] = v.filter((c) => c >= lo + i * w && (i === nb - 1 ? c <= hi : c < lo + (i + 1) * w)).length / v.length;
    }
    return row;
  });
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="x" type="number" domain={[lo, hi]} {...axis} tickFormatter={(v) => kmoney(v, lang)} />
          <YAxis {...axis} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={44} />
          <Tooltip {...tooltipStyle} labelFormatter={(v) => `≈ ${money(Number(v), lang)}`} formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
          {policies.map((p) => <Line key={p} dataKey={p} name={d(`policy.short.${p}` as never)} stroke={`var(--p-${p})`} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />)}
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function CostBreakdownChart({ policies, height = 280 }: { policies: PolicyResult[]; height?: number }) {
  const { t, d, lang } = useI18n();
  const parts: [string, string, string][] = [
    ["instructor_cost", t("instructors", "docentes"), "var(--primary)"],
    ["room_cost", t("rooms", "salones"), "var(--p-pfa)"],
    ["adjunct_fees", t("adjunct fees", "cuotas adjuntos"), "var(--c-7A)"],
    ["move_admin", t("room moves", "cambios de salón"), "var(--ink-muted)"],
    ["change_penalty", t("students moved", "alumnos cambiados"), "var(--mark)"],
    ["unserved_penalty", t("students without a seat", "alumnos sin lugar"), "var(--bad)"],
  ];
  const data = policies.map((p) => ({ name: d(`policy.short.${p.name}` as never), ...Object.fromEntries(parts.map(([k]) => [k, p.stats[k].mean])) }));
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 10 }}>
          <CartesianGrid {...grid} horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={(v) => kmoney(v, lang)} />
          <YAxis type="category" dataKey="name" {...axis} width={110} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => money(v, lang)} />
          {parts.map(([k, label, color]) => <Bar key={k} dataKey={k} name={label} stackId="a" fill={color} isAnimationActive={false} />)}
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
