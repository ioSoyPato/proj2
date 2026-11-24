import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import type { PolicyName } from "../lib/api";

export function Loading({ label, height = 180 }: { label?: string; height?: number }) {
  const { d } = useI18n();
  return (
    <div role="status" aria-live="polite" style={{ margin: "1rem 0" }}>
      <div className="skeleton" style={{ height }} />
      <div className="muted small" style={{ marginTop: "0.4rem" }}>{label ?? d("loading")}</div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  const { d } = useI18n();
  return (
    <div role="alert" style={{ borderLeft: "3px solid var(--bad)", background: "var(--bad-soft)", padding: "0.8rem 1rem", borderRadius: "0 4px 4px 0", maxWidth: "72ch" }}>
      <strong>{d("error.api")}</strong>
      <div className="small muted" style={{ marginTop: "0.3rem", wordBreak: "break-word" }}>{error}</div>
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: ReactNode; tone?: "mark" | "bad" | "good" }) {
  const color = tone === "mark" ? "var(--mark-ink)" : tone === "bad" ? "var(--bad)" : tone === "good" ? "var(--good)" : "var(--ink)";
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "1.9rem", fontWeight: 650, color, lineHeight: 1.1 }}>{value}</div>
      <div className="small muted" style={{ marginTop: "0.2rem", maxWidth: "22ch" }}>{label}</div>
    </div>
  );
}

export function PolicyDot({ p }: { p: PolicyName }) {
  return <span className="dot" style={{ background: `var(--p-${p})` }} aria-hidden />;
}

export function PolicyName_({ p, short }: { p: PolicyName; short?: boolean }) {
  const { d } = useI18n();
  return <span style={{ whiteSpace: "nowrap" }}><PolicyDot p={p} />{d((short ? `policy.short.${p}` : `policy.${p}`) as never)}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", fontSize: "0.88rem", fontWeight: 500 }}>{label}</span>
      {children}
      {hint && <span className="small muted">{hint}</span>}
    </label>
  );
}

export function PageHead({ title, lede }: { title: string; lede?: ReactNode }) {
  return (
    <header style={{ marginBottom: "1.6rem" }}>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}
