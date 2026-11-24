import type { ReactNode } from "react";
import { useLang } from "../lib/i18n";

export function Panel({ title, sub, children, id }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="panel" id={id}>
      {title && <div className="panel-title">{title}</div>}
      {sub ? <div className="panel-sub">{sub}</div> : title ? <div style={{ height: "0.6rem" }} /> : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "gain" | "loss" | "you" }) {
  const color = tone === "gain" ? "var(--gain)" : tone === "loss" ? "var(--loss)" : tone === "you" ? "var(--you)" : "var(--ink)";
  return (
    <div style={{ minWidth: "8rem" }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value num" style={{ color }}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Table({ head, rows, highlight, leftCols = 1 }: { head: ReactNode[]; rows: ReactNode[][]; highlight?: number; leftCols?: number }) {
  const al = (i: number) => (i < leftCols ? { textAlign: "left" as const } : undefined);
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope="col" style={al(i)}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={ri === highlight ? "hl" : undefined}>
              {r.map((c, ci) => <td key={ci} style={al(ci)}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({ tone = "you", children }: { tone?: "you" | "gain" | "loss" | "neutral"; children: ReactNode }) {
  return <div className={`callout ${tone === "you" ? "" : tone}`}>{children}</div>;
}

export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ background: color }} aria-hidden="true" />;
}

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" style={{ margin: "1rem 0" }}>
      <div className="small muted" style={{ marginBottom: "0.4rem" }}>{label}</div>
      <div className="progress"><div /></div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  const { tx } = useLang();
  return (
    <Callout tone="loss">
      <strong>{tx("The server did not answer.", "El servidor no respondió.")}</strong>{" "}
      {tx("Check that the backend is running on port 8001 (local dev) and try again.", "Verifica que el backend esté corriendo en el puerto 8001 (desarrollo local) e intenta de nuevo.")}
      <div className="small muted" style={{ marginTop: "0.3rem" }}>{error}</div>
    </Callout>
  );
}

// ---------- formatting (locale-aware) ----------

export function useFmt() {
  const { lang } = useLang();
  const loc = lang === "es" ? "es-MX" : "en-US";
  const money = (x: number | null | undefined, digits = 0) =>
    x === null || x === undefined || Number.isNaN(x)
      ? "—"
      : new Intl.NumberFormat(loc, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
  const kmoney = (x: number | null | undefined) => {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    const a = Math.abs(x);
    const sign = x < 0 ? "−" : "";
    if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
    return `${sign}$${a.toFixed(0)}`;
  };
  const signedK = (x: number) => (x > 0 ? "+" : "") + kmoney(x);
  const pct = (x: number | null | undefined, digits = 1) =>
    x === null || x === undefined || Number.isNaN(x) ? "—" : `${(x * 100).toLocaleString(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  const num = (x: number | null | undefined, digits = 2) =>
    x === null || x === undefined || Number.isNaN(x) ? "—" : x.toLocaleString(loc, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return { money, kmoney, signedK, pct, num, loc };
}
