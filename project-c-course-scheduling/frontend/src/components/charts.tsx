import type { ReactNode } from "react";

/** Shared Recharts styling so every chart reads as one system. */
export const axis = { stroke: "var(--rule-strong)", tick: { fill: "var(--ink-muted)", fontSize: 12 } } as const;
export const grid = { stroke: "var(--rule)", strokeDasharray: "2 4" } as const;
export const tooltipStyle = {
  contentStyle: { background: "var(--raised)", border: "1px solid var(--rule-strong)", borderRadius: 6, fontSize: 13, color: "var(--ink)" },
  labelStyle: { color: "var(--ink-muted)" },
  itemStyle: { color: "var(--ink)" },
} as const;

export function ChartFrame({ title, children, note, height = 300 }: { title?: string; children: ReactNode; note?: ReactNode; height?: number }) {
  return (
    <figure style={{ margin: "1rem 0" }}>
      {title && <figcaption style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{title}</figcaption>}
      <div style={{ width: "100%", height }}>{children}</div>
      {note && <div className="small muted" style={{ marginTop: "0.4rem", maxWidth: "72ch" }}>{note}</div>}
    </figure>
  );
}
