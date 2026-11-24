import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "es";

const STORAGE_KEY = "boxoffice.lang";

function readLang(): Lang {
  // ?lang=es / ?lang=en (e.g. from the portal iframe) overrides the stored choice
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "es" || q === "en") return q;
  } catch {
    /* ignore */
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

// Short UI strings.  Long prose lives next to its page via `p(en, es)`.
const DICT = {
  en: {
    "brand.name": "Box Office Pricing",
    "brand.sub": "Dynamic ticket pricing for a sold-out night, modelled with Powell's framework",
    "nav.overview": "Recommendation",
    "nav.dashboard": "Plan your sale",
    "nav.sensitivity": "Sensitivity",
    "nav.model": "The model",
    "nav.policies": "Policies",
    "nav.evaluation": "Evaluation",
    "nav.calibration": "Calibration",
    "nav.run": "Run it yourself",
    "nav.live": "live",
    "nav.menu": "Menu",
    "nav.close": "Close menu",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.auto": "Auto",
    "theme.label": "Colour theme",
    "lang.label": "Language",
    "policy.fixed": "Fixed price",
    "policy.pfa": "Price-schedule rule",
    "policy.dla": "Daily lookahead (MILP)",
    "policy.rl": "RL agent (DQN)",
    "policy.fixed.short": "Fixed",
    "policy.pfa.short": "Rule",
    "policy.dla.short": "Lookahead",
    "policy.rl.short": "RL",
    "class.baseline": "Baseline",
    "class.PFA": "PFA · policy function approximation",
    "class.DLA": "DLA · direct lookahead",
    "class.VFA": "VFA · value function approximation",
    "m.mean": "Mean revenue",
    "m.ci": "95% CI of the mean",
    "m.std": "Std. dev.",
    "m.p5": "P5",
    "m.p95": "P95",
    "m.sellout": "Sell-out probability",
    "m.sold": "Tickets sold",
    "m.avgpaid": "Avg. price paid",
    "m.vsfixed": "Gain vs fixed",
    "m.win": "Beats fixed in",
    "m.policy": "Policy",
    "m.class": "Class",
    "m.firstprice": "Opening price",
    "m.unsold": "Empty seats",
    "chart.daysleft": "Days before the event",
    "chart.price": "Price ($)",
    "chart.revenue": "Revenue ($)",
    "chart.seats": "Seats left",
    "chart.scenarios": "Scenarios",
    "chart.plan": "Lookahead plan on day one",
    "chart.band": "10th–90th percentile",
    "banner.uncal.title": "Not yet calibrated with real data.",
    "banner.uncal.body": "The arrival curve uses documented default parameters. To fit its shape on the Kaggle Flight Prices data, fill KAGGLE_API_TOKEN (or KAGGLE_USERNAME + KAGGLE_KEY, or FLIGHT_PRICES_CSV) in credentials.env and run",
    "banner.cal.title": "Arrival curve calibrated on real data",
    "banner.stale": "The precomputed results were generated before the current calibration. Re-run the precompute script.",
    "rec.label": "Recommended price for the first day",
    "rec.policy": "Recommended policy",
    "rec.expected": "Expected revenue",
    "rec.sellout": "Chance of selling out",
    "rec.gain": "vs best fixed price",
    "rec.tied": "statistically tied",
    "load.loading": "Loading results…",
    "load.error": "Could not reach the pricing service.",
    "load.retry": "Try again",
    "load.computing": "Simulating every policy on the same scenarios…",
    "dash.run": "Run simulation",
    "dash.reset": "Back to defaults",
    "dash.scen": "Scenarios",
    "dash.livelabel": "Live run",
    "dash.prelabel": "Precomputed (defaults)",
    "ood.flag": "outside training range",
    "ood.excluded": "excluded",
    "unit.days": "days",
    "unit.seats": "seats",
    "yes": "yes",
    "no": "no",
  },
  es: {
    "brand.name": "Taquilla Dinámica",
    "brand.sub": "Precios dinámicos de boletos para una noche agotada, modelados con el marco de Powell",
    "nav.overview": "Recomendación",
    "nav.dashboard": "Planea tu venta",
    "nav.sensitivity": "Sensibilidad",
    "nav.model": "El modelo",
    "nav.policies": "Políticas",
    "nav.evaluation": "Evaluación",
    "nav.calibration": "Calibración",
    "nav.run": "Ejecútalo tú",
    "nav.live": "en vivo",
    "nav.menu": "Menú",
    "nav.close": "Cerrar menú",
    "theme.light": "Claro",
    "theme.dark": "Oscuro",
    "theme.auto": "Auto",
    "theme.label": "Tema de color",
    "lang.label": "Idioma",
    "policy.fixed": "Precio fijo",
    "policy.pfa": "Regla de calendario de precios",
    "policy.dla": "Anticipación diaria (MILP)",
    "policy.rl": "Agente RL (DQN)",
    "policy.fixed.short": "Fijo",
    "policy.pfa.short": "Regla",
    "policy.dla.short": "Anticipación",
    "policy.rl.short": "RL",
    "class.baseline": "Línea base",
    "class.PFA": "PFA · aproximación de función de política",
    "class.DLA": "DLA · anticipación directa",
    "class.VFA": "VFA · aproximación de función de valor",
    "m.mean": "Ingreso medio",
    "m.ci": "IC 95% de la media",
    "m.std": "Desv. est.",
    "m.p5": "P5",
    "m.p95": "P95",
    "m.sellout": "Probabilidad de agotar",
    "m.sold": "Boletos vendidos",
    "m.avgpaid": "Precio medio pagado",
    "m.vsfixed": "Ganancia vs fijo",
    "m.win": "Supera al fijo en",
    "m.policy": "Política",
    "m.class": "Clase",
    "m.firstprice": "Precio inicial",
    "m.unsold": "Asientos vacíos",
    "chart.daysleft": "Días antes del evento",
    "chart.price": "Precio ($)",
    "chart.revenue": "Ingreso ($)",
    "chart.seats": "Asientos restantes",
    "chart.scenarios": "Escenarios",
    "chart.plan": "Plan de anticipación del primer día",
    "chart.band": "Percentil 10–90",
    "banner.uncal.title": "Aún no calibrado con datos reales.",
    "banner.uncal.body": "La curva de llegadas usa parámetros por defecto documentados. Para ajustar su forma con los datos de Kaggle Flight Prices, llena KAGGLE_API_TOKEN (o KAGGLE_USERNAME + KAGGLE_KEY, o FLIGHT_PRICES_CSV) en credentials.env y ejecuta",
    "banner.cal.title": "Curva de llegadas calibrada con datos reales",
    "banner.stale": "Los resultados precalculados se generaron antes de la calibración actual. Vuelve a ejecutar el script de precálculo.",
    "rec.label": "Precio recomendado para el primer día",
    "rec.policy": "Política recomendada",
    "rec.expected": "Ingreso esperado",
    "rec.sellout": "Probabilidad de agotar",
    "rec.gain": "vs el mejor precio fijo",
    "rec.tied": "empate estadístico",
    "load.loading": "Cargando resultados…",
    "load.error": "No se pudo contactar el servicio de precios.",
    "load.retry": "Reintentar",
    "load.computing": "Simulando todas las políticas en los mismos escenarios…",
    "dash.run": "Correr simulación",
    "dash.reset": "Volver a los valores por defecto",
    "dash.scen": "Escenarios",
    "dash.livelabel": "Corrida en vivo",
    "dash.prelabel": "Precalculado (valores por defecto)",
    "ood.flag": "fuera del rango de entrenamiento",
    "ood.excluded": "excluido",
    "unit.days": "días",
    "unit.seats": "asientos",
    "yes": "sí",
    "no": "no",
  },
} as const;

export type DictKey = keyof (typeof DICT)["en"];

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
  p: <T>(en: T, es: T) => T;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = DICT[lang]["brand.name"];
  }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* storage unavailable: keep in memory only */
    }
  };
  const value: LangCtx = {
    lang,
    setLang,
    t: (k) => DICT[lang][k] ?? k,
    p: (en, es) => (lang === "en" ? en : es),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang outside LangProvider");
  return c;
}
