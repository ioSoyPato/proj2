import { useEffect, useState } from "react";
import { Nav, type PageKey, type Theme } from "./components/Nav";
import { useI18n } from "./lib/i18n";
import { Overview } from "./pages/Overview";
import { DataPage } from "./pages/DataPage";
import { ModelPage } from "./pages/ModelPage";
import { TimetablePage } from "./pages/TimetablePage";
import { WeeksPage } from "./pages/WeeksPage";
import { PoliciesPage } from "./pages/PoliciesPage";
import { ResultsPage } from "./pages/ResultsPage";
import { SensitivityPage } from "./pages/SensitivityPage";
import { LabPage } from "./pages/LabPage";
import { MethodPage } from "./pages/MethodPage";

const PAGES: PageKey[] = ["overview", "data", "model", "timetable", "weeks", "policies", "results", "sensitivity", "lab", "method"];

function readHash(): PageKey {
  const h = window.location.hash.replace("#", "") as PageKey;
  return PAGES.includes(h) ? h : "overview";
}
function readTheme(): Theme {
  try {
    const v = localStorage.getItem("theme");
    return v === "light" || v === "dark" ? v : "system";
  } catch { return "system"; }
}

export default function App() {
  const { d } = useI18n();
  const [page, setPage] = useState<PageKey>(readHash);
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const on = () => setPage(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem("theme", t); } catch { /* ignore */ }
  };
  const go = (k: PageKey) => {
    window.location.hash = k;
    setPage(k);
    setMenu(false);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="shell">
      <div className="topbar">
        <strong style={{ fontFamily: "var(--font-display)" }}>{d("app.title")}</strong>
        <button className="btn ghost" onClick={() => setMenu(true)} aria-expanded={menu}>{d("menu")}</button>
      </div>
      <aside className={`sidebar${menu ? " open" : ""}`}>
        {menu && <button className="btn ghost" style={{ alignSelf: "flex-end" }} onClick={() => setMenu(false)}>{d("close")}</button>}
        <Nav current={page} onNavigate={go} theme={theme} setTheme={setTheme} />
      </aside>
      <main className="main">
        <div className="page">
          {page === "overview" && <Overview go={go} />}
          {page === "data" && <DataPage />}
          {page === "model" && <ModelPage />}
          {page === "timetable" && <TimetablePage />}
          {page === "weeks" && <WeeksPage />}
          {page === "policies" && <PoliciesPage />}
          {page === "results" && <ResultsPage />}
          {page === "sensitivity" && <SensitivityPage go={go} />}
          {page === "lab" && <LabPage />}
          {page === "method" && <MethodPage />}
        </div>
      </main>
    </div>
  );
}
