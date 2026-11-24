import { useEffect, useState } from "react";
import { useLang, type Lang } from "../lib/i18n";

export type PageKey =
  | "overview" | "advisor" | "model" | "profile" | "portfolio" | "policies" | "evaluation" | "recommendation" | "data";

const GROUPS: { title: { en: string; es: string }; items: { key: PageKey; en: string; es: string; live?: boolean }[] }[] = [
  {
    title: { en: "For the client", es: "Para el cliente" },
    items: [
      { key: "overview", en: "Overview", es: "Resumen" },
      { key: "advisor", en: "Advisor dashboard", es: "Tablero del asesor", live: true },
    ],
  },
  {
    title: { en: "The report", es: "El reporte" },
    items: [
      { key: "model", en: "The Powell model", es: "El modelo de Powell" },
      { key: "profile", en: "Client profile", es: "Perfil del cliente" },
      { key: "portfolio", en: "Portfolio MILP", es: "Portafolio MILP" },
      { key: "policies", en: "Policies", es: "Políticas" },
      { key: "evaluation", en: "Evaluation", es: "Evaluación" },
      { key: "recommendation", en: "Recommendation", es: "Recomendación" },
      { key: "data", en: "Data and reproducibility", es: "Datos y reproducibilidad" },
    ],
  },
];

type Theme = "auto" | "light" | "dark";
const THEME_KEY = "behavior-gap.theme";

function readTheme(): Theme {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, setTheme] as const;
}

export function Brand() {
  return (
    <div className="brand">
      <img src="/favicon.svg" width={30} height={30} alt="" style={{ borderRadius: 7 }} />
      <div className="brand-name">Behavior Gap</div>
    </div>
  );
}

export function Nav({ current, onNavigate }: { current: PageKey; onNavigate: (k: PageKey) => void }) {
  const { lang, setLang, tx } = useLang();
  const [theme, setTheme] = useTheme();
  return (
    <>
      <div>
        <Brand />
        <div className="brand-sub">
          {tx("A portfolio built for the person who has to hold it.", "Un portafolio hecho para la persona que tiene que sostenerlo.")}
        </div>
      </div>
      <nav aria-label={tx("Sections", "Secciones")} style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {GROUPS.map((g) => (
          <div key={g.title.en} className="nav-group">
            <div className="nav-group-title">{g.title[lang]}</div>
            {g.items.map((it) => (
              <button key={it.key} className="nav-btn" aria-current={it.key === current ? "page" : undefined} onClick={() => onNavigate(it.key)}>
                <span style={{ flex: 1 }}>{it[lang]}</span>
                {it.live && <span className="dot" title={tx("interactive", "interactivo")} />}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="nav-foot">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <span className="small muted">{tx("Language", "Idioma")}</span>
          <div className="seg" role="group" aria-label={tx("Language", "Idioma")}>
            {(["en", "es"] as Lang[]).map((l) => (
              <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <span className="small muted">{tx("Theme", "Tema")}</span>
          <div className="seg" role="group" aria-label={tx("Theme", "Tema")}>
            {(["auto", "light", "dark"] as Theme[]).map((t) => (
              <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>
                {t === "auto" ? tx("Auto", "Auto") : t === "light" ? tx("Light", "Claro") : tx("Dark", "Oscuro")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
