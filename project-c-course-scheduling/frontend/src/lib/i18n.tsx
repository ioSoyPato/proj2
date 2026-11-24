import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "es";

/** Shared UI vocabulary. Long-form prose lives next to its page as t(en, es) pairs. */
const DICT = {
  "app.title": { en: "Timetable under uncertainty", es: "Horario bajo incertidumbre" },
  "app.subtitle": { en: "Course scheduling for a Financial Engineering department: MILP + sequential decisions", es: "Programación de cursos para un departamento de Ingeniería Financiera: MILP + decisiones secuenciales" },
  "nav.overview": { en: "Overview", es: "Resumen" },
  "nav.data": { en: "The data", es: "Los datos" },
  "nav.model": { en: "The model", es: "El modelo" },
  "nav.timetable": { en: "Initial timetable", es: "Horario inicial" },
  "nav.weeks": { en: "Registration, week by week", es: "Inscripciones, semana a semana" },
  "nav.policies": { en: "Policies", es: "Políticas" },
  "nav.results": { en: "Results", es: "Resultados" },
  "nav.sensitivity": { en: "Recommendation", es: "Recomendación" },
  "nav.lab": { en: "Try your own inputs", es: "Prueba tus supuestos" },
  "nav.method": { en: "Method & reproducibility", es: "Método y reproducibilidad" },
  "hint.phase1": { en: "phase 1", es: "fase 1" },
  "hint.phase2": { en: "phase 2", es: "fase 2" },
  "hint.live": { en: "live", es: "en vivo" },
  "theme.light": { en: "Light", es: "Claro" },
  "theme.dark": { en: "Dark", es: "Oscuro" },
  "theme.system": { en: "Auto", es: "Auto" },
  "menu": { en: "Menu", es: "Menú" },
  "close": { en: "Close", es: "Cerrar" },
  "loading": { en: "Loading…", es: "Cargando…" },
  "error.api": { en: "Could not reach the backend. Start it with `uvicorn app.api.main:app --port 8003` and reload.", es: "No se pudo contactar al backend. Inícialo con `uvicorn app.api.main:app --port 8003` y recarga." },
  "policy.baseline": { en: "Baseline: no changes", es: "Base: sin cambios" },
  "policy.pfa": { en: "Waitlist rule (PFA)", es: "Regla de lista de espera (PFA)" },
  "policy.dla": { en: "Weekly re-optimization (DLA)", es: "Re-optimización semanal (DLA)" },
  "policy.rl": { en: "Learned Q-table (VFA / RL)", es: "Tabla Q aprendida (VFA / RL)" },
  "policy.short.baseline": { en: "Baseline", es: "Base" },
  "policy.short.pfa": { en: "Waitlist rule", es: "Regla de espera" },
  "policy.short.dla": { en: "Re-optimization", es: "Re-optimización" },
  "policy.short.rl": { en: "Q-learning", es: "Q-learning" },
  "m.total_cost": { en: "Total cost", es: "Costo total" },
  "m.unserved": { en: "Students without a seat", es: "Estudiantes sin lugar" },
  "m.changed": { en: "Students moved after publication", es: "Estudiantes cambiados tras publicar" },
  "mean": { en: "Mean", es: "Media" },
  "std": { en: "Std. dev.", es: "Desv. est." },
  "ci95": { en: "95% CI", es: "IC 95%" },
  "week": { en: "Week", es: "Semana" },
  "cohort": { en: "Cohort", es: "Grupo" },
  "professor": { en: "Professor", es: "Profesor" },
  "room": { en: "Room", es: "Salón" },
  "all": { en: "All", es: "Todos" },
  "mw": { en: "Mon–Wed", es: "Lun–Mié" },
  "tt": { en: "Tue–Thu", es: "Mar–Jue" },
  "synthetic": {
    en: "Synthetic data. The assignment specifies data “provided by the course”; those files were not supplied, so a seeded, documented generator produced an instance with exactly the specified shape (25 courses, 37 sections, 6 cohorts, 14 professors, 5 adjuncts, 10 rooms, 14 meeting patterns, 5 years of enrollment history).",
    es: "Datos sintéticos. La tarea especifica datos “proporcionados por el curso”; esos archivos no se entregaron, así que un generador con semilla y documentado produjo una instancia con exactamente la forma pedida (25 cursos, 37 secciones, 6 grupos, 14 profesores, 5 adjuntos, 10 salones, 14 patrones de horario, 5 años de historial de inscripción).",
  },
} as const;

export type DictKey = keyof typeof DICT;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (en: string, es: string) => string;
  d: (k: DictKey) => string;
}

const Ctx = createContext<I18n | null>(null);

function readLang(): Lang {
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "es" || q === "en") return q;
  try {
    const v = localStorage.getItem("lang");
    return v === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo<I18n>(() => ({
    lang, setLang,
    t: (en, es) => (lang === "es" ? es : en),
    d: (k) => DICT[k][lang],
  }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("I18nProvider missing");
  return v;
}
