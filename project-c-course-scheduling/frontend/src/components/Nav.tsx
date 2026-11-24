import { useI18n, type DictKey } from "../lib/i18n";
import { Seg } from "./ui";

export type PageKey = "overview" | "data" | "model" | "timetable" | "weeks" | "policies" | "results" | "sensitivity" | "lab" | "method";

const ITEMS: { key: PageKey; label: DictKey; hint?: DictKey }[] = [
  { key: "overview", label: "nav.overview" },
  { key: "data", label: "nav.data" },
  { key: "model", label: "nav.model" },
  { key: "timetable", label: "nav.timetable", hint: "hint.phase1" },
  { key: "weeks", label: "nav.weeks", hint: "hint.phase2" },
  { key: "policies", label: "nav.policies" },
  { key: "results", label: "nav.results" },
  { key: "sensitivity", label: "nav.sensitivity" },
  { key: "lab", label: "nav.lab", hint: "hint.live" },
  { key: "method", label: "nav.method" },
];

export type Theme = "system" | "light" | "dark";

export function Nav({ current, onNavigate, theme, setTheme }: {
  current: PageKey; onNavigate: (k: PageKey) => void; theme: Theme; setTheme: (t: Theme) => void;
}) {
  const { d, lang, setLang, t } = useI18n();
  return (
    <>
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 750, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{d("app.title")}</div>
        <div className="small muted" style={{ marginTop: "0.4rem", lineHeight: 1.35 }}>{d("app.subtitle")}</div>
      </div>
      <nav aria-label={t("Sections", "Secciones")} style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
        {ITEMS.map((it) => (
          <button key={it.key} className="nav-btn" aria-current={it.key === current ? "page" : undefined} onClick={() => onNavigate(it.key)}>
            <span>{d(it.label)}</span>
            {it.hint && <span className="hint">{d(it.hint)}</span>}
          </button>
        ))}
      </nav>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <Seg label={t("Language", "Idioma")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "es", label: "Español" }]} />
        <Seg label={t("Theme", "Tema")} value={theme} onChange={setTheme}
          options={[{ value: "system", label: d("theme.system") }, { value: "light", label: d("theme.light") }, { value: "dark", label: d("theme.dark") }]} />
      </div>
    </>
  );
}
