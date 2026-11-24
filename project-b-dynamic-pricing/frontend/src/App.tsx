import { useEffect, useState } from "react";
import { DataProvider } from "./lib/data";
import { useLang, type Lang } from "./lib/i18n";
import { Overview } from "./pages/Overview";
import { Dashboard } from "./pages/Dashboard";
import { SensitivityPage } from "./pages/Sensitivity";
import { ModelPage } from "./pages/Model";
import { PoliciesPage } from "./pages/Policies";
import { EvaluationPage } from "./pages/Evaluation";
import { CalibrationPage } from "./pages/Calibration";
import { RunPage } from "./pages/Run";

export type PageKey = "overview" | "dashboard" | "sensitivity" | "model" | "policies" | "evaluation" | "calibration" | "run";
const PAGES: PageKey[] = ["overview", "dashboard", "sensitivity", "model", "policies", "evaluation", "calibration", "run"];

type Theme = "auto" | "light" | "dark";
const THEME_KEY = "boxoffice.theme";

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

function readPage(): PageKey {
  const h = window.location.hash.replace("#", "") as PageKey;
  return PAGES.includes(h) ? h : "overview";
}

export default function App() {
  const { t, lang, setLang } = useLang();
  const [page, setPage] = useState<PageKey>(readPage);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const onHash = () => setPage(readPage());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (k: PageKey) => {
    setPage(k);
    setOpen(false);
    if (window.location.hash !== `#${k}`) window.history.pushState(null, "", `#${k}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <DataProvider>
      <div className="shell">
        <header className="topbar">
          <div className="brand">{t("brand.name")}</div>
          <button className="btn small ghost" onClick={() => setOpen(true)} aria-expanded={open}>{t("nav.menu")}</button>
        </header>
        {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden />}
        <aside className={`sidebar${open ? " open" : ""}`} aria-label="Navigation">
          <div className="brand">
            {t("brand.name")}
            <small>{t("brand.sub")}</small>
          </div>
          <nav className="nav">
            {PAGES.map((k) => (
              <button key={k} onClick={() => go(k)} aria-current={page === k ? "page" : undefined}>
                <span>{t(`nav.${k}`)}</span>
                {k === "dashboard" && <span className="tag">{t("nav.live")}</span>}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            <div className="seg" role="group" aria-label={t("lang.label")}>
              {(["en", "es"] as Lang[]).map((l) => (
                <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label={t("theme.label")}>
              {(["auto", "light", "dark"] as Theme[]).map((m) => (
                <button key={m} aria-pressed={theme === m} onClick={() => setTheme(m)}>{t(`theme.${m}`)}</button>
              ))}
            </div>
            {open && <button className="btn small ghost" onClick={() => setOpen(false)}>{t("nav.close")}</button>}
          </div>
        </aside>
        <main className="main">
          <div className="col">
            {page === "overview" && <Overview go={go} />}
            {page === "dashboard" && <Dashboard />}
            {page === "sensitivity" && <SensitivityPage />}
            {page === "model" && <ModelPage />}
            {page === "policies" && <PoliciesPage />}
            {page === "evaluation" && <EvaluationPage />}
            {page === "calibration" && <CalibrationPage />}
            {page === "run" && <RunPage />}
          </div>
        </main>
      </div>
    </DataProvider>
  );
}
