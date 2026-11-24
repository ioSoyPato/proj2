import type { ReactNode } from "react";
import type { PolicyKey } from "../lib/api";
import { useLang } from "../lib/i18n";
import { useData } from "../lib/data";

export const POLICY_COLOR: Record<PolicyKey, string> = {
  fixed: "var(--c-fixed)",
  pfa: "var(--c-pfa)",
  dla: "var(--c-dla)",
  rl: "var(--c-rl)",
};

export function Panel({ title, sub, children, id }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="panel" id={id}>
      {title && <h3>{title}</h3>}
      {sub && <p className="panel-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function PolicyName({ k, short = false, rec = false }: { k: PolicyKey; short?: boolean; rec?: boolean }) {
  const { t } = useLang();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
      <span className="swatch" style={{ background: POLICY_COLOR[k] }} aria-hidden />
      <span>{t(short ? (`policy.${k}.short` as const) : (`policy.${k}` as const))}</span>
      {rec && <span className="chip rec">★</span>}
    </span>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useLang();
  return (
    <div className="muted" style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "2rem 0" }} role="status">
      <span className="spinner" aria-hidden /> {label ?? t("load.loading")}
    </div>
  );
}

export function ErrorBox({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  const { t, p } = useLang();
  return (
    <div className="banner" role="alert">
      <span className="icon" aria-hidden>!</span>
      <div>
        <strong>{t("load.error")}</strong>
        <p className="small">{msg}</p>
        <p className="small">
          {p("Start the backend with ", "Inicia el backend con ")}
          <code>uvicorn app.api.main:app --port 8002</code>
          {p(" from the backend folder.", " desde la carpeta backend.")}
        </p>
        {onRetry && <button className="btn small ghost" onClick={onRetry} style={{ marginTop: "0.4rem" }}>{t("load.retry")}</button>}
      </div>
    </div>
  );
}

/** Prominent notice whenever the arrival curve is NOT calibrated on real data. */
export function CalibrationBanner() {
  const { meta } = useData();
  const { t, p } = useLang();
  if (!meta) return null;
  const pc = meta.precomputed.calibration_used;
  if (meta.calibration.is_real_data) {
    const stale = pc && (!pc.is_real_data || Math.abs(pc.b - meta.calibration.b) > 1e-9);
    return (
      <div className="banner info">
        <span className="icon" aria-hidden>✓</span>
        <div>
          <strong>{t("banner.cal.title")}</strong> ({meta.calibration.route}, b = {meta.calibration.b.toFixed(4)})
          {stale && <p>{t("banner.stale")} <code>python -m scripts.precompute</code></p>}
        </div>
      </div>
    );
  }
  return (
    <div className="banner" role="note">
      <span className="icon" aria-hidden>!</span>
      <div>
        <strong>{t("banner.uncal.title")}</strong>
        <p>
          {t("banner.uncal.body")} <code>python -m scripts.calibrate</code>
          {p(" (from backend/).", " (desde backend/).")}
        </p>
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: PolicyKey | "amber" }) {
  const color = tone === "amber" ? "var(--amber-ink)" : tone ? POLICY_COLOR[tone] : "var(--ink)";
  return (
    <div style={{ minWidth: "8.5rem" }}>
      <div className="small muted">{label}</div>
      <div className="display-num" style={{ fontSize: "2rem", lineHeight: 1.05, color }}>{value}</div>
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "1.2rem 2.2rem", margin: "0.6rem 0" }}>{children}</div>;
}
