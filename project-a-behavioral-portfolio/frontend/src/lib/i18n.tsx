import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PolicyKey } from "./api";

export type Lang = "en" | "es";

const STORAGE_KEY = "behavior-gap.lang";

function readLang(): Lang {
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "es" || q === "en") return q;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** inline bilingual string: tx("Hello", "Hola") */
  tx: (en: string, es: string) => string;
}

const Ctx = createContext<LangCtx>({ lang: "en", setLang: () => {}, tx: (en) => en });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable: keep the choice for this session only */
    }
    document.documentElement.lang = l;
  }, []);
  const tx = useCallback((en: string, es: string) => (lang === "es" ? es : en), [lang]);
  const value = useMemo(() => ({ lang, setLang, tx }), [lang, setLang, tx]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}

/** Bilingual block of JSX. */
export function L({ en, es }: { en: ReactNode; es: ReactNode }) {
  const { lang } = useLang();
  return <>{lang === "es" ? es : en}</>;
}

// ---------- shared vocabulary ----------

export const POLICY_NAMES: Record<PolicyKey, { en: string; es: string }> = {
  buy_hold: { en: "Buy and hold", es: "Comprar y mantener" },
  pfa_band: { en: "Band rebalancing", es: "Rebalanceo por bandas" },
  cfa_milp: { en: "Annual re-optimization", es: "Re-optimización anual" },
  panic: { en: "Panic seller", es: "Vendedor en pánico" },
  chaser: { en: "Performance chaser", es: "Perseguidor de rendimientos" },
  unassisted: { en: "You, unassisted", es: "Tú, sin asesoría" },
};

export const POLICY_SHORT: Record<PolicyKey, { en: string; es: string }> = {
  buy_hold: { en: "Holds the MILP portfolio and never trades again.", es: "Mantiene el portafolio MILP y no vuelve a operar." },
  pfa_band: { en: "Rebalances to the MILP weights when any weight drifts past a tuned band.", es: "Rebalancea a los pesos MILP cuando algún peso se desvía más allá de una banda calibrada." },
  cfa_milp: { en: "Re-solves the MILP every 12 months with the data known at that date.", es: "Resuelve de nuevo el MILP cada 12 meses con los datos conocidos a esa fecha." },
  panic: { en: "Disciplined, until a drawdown of d sends everything to cash; buys back after a rebound of r.", es: "Disciplinado, hasta que una caída de d lo manda todo a efectivo; recompra tras un rebote de r." },
  chaser: { en: "Disciplined, but every f months moves a share k into last year's top three winners.", es: "Disciplinado, pero cada f meses mueve una fracción k a los tres ganadores del último año." },
  unassisted: { en: "Both tendencies at once, with the client's own parameters.", es: "Ambas tendencias a la vez, con los parámetros del propio cliente." },
};

export const CLASS_NAMES: Record<string, { en: string; es: string }> = {
  "US equity": { en: "US equity", es: "Acciones EE. UU." },
  "US sectors": { en: "US sectors", es: "Sectores EE. UU." },
  "International equity": { en: "International equity", es: "Acciones internacionales" },
  "Real estate": { en: "Real estate", es: "Bienes raíces" },
  "Government bonds": { en: "Government bonds", es: "Bonos de gobierno" },
  Credit: { en: "Credit", es: "Crédito" },
  Commodities: { en: "Commodities", es: "Materias primas" },
  Cash: { en: "Cash", es: "Efectivo" },
};

export const RISK_LABEL: Record<string, { en: string; es: string }> = {
  low: { en: "low loss aversion", es: "aversión a pérdidas baja" },
  moderate: { en: "moderate loss aversion", es: "aversión a pérdidas moderada" },
  high: { en: "high loss aversion", es: "aversión a pérdidas alta" },
  very_high: { en: "very high loss aversion", es: "aversión a pérdidas muy alta" },
};

export function usePick() {
  const { lang } = useLang();
  return (d: { en: string; es: string } | undefined, fallback = "") => (d ? d[lang] : fallback);
}

export const POLICY_CLASS: Record<string, { en: string; es: string }> = {
  Baseline: { en: "Baseline", es: "Base" },
  PFA: { en: "PFA", es: "PFA" },
  CFA: { en: "CFA", es: "CFA" },
  Behavioral: { en: "Behavioral", es: "Conductual" },
};
