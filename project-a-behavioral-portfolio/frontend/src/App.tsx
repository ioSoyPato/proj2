import { useEffect, useState } from "react";
import { Brand, Nav, type PageKey } from "./components/Nav";
import { ErrorBox, Loading } from "./components/ui";
import { useLang } from "./lib/i18n";
import { StoreProvider, useStore } from "./lib/store";
import { Overview } from "./pages/Overview";
import { Advisor } from "./pages/Advisor";
import { Model } from "./pages/Model";
import { ProfilePage } from "./pages/ProfilePage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { Policies } from "./pages/Policies";
import { Evaluation } from "./pages/Evaluation";
import { Recommendation } from "./pages/Recommendation";
import { DataPage } from "./pages/DataPage";

const PAGES: PageKey[] = ["overview", "advisor", "model", "profile", "portfolio", "policies", "evaluation", "recommendation", "data"];

function readHash(): PageKey {
  const h = window.location.hash.replace("#", "") as PageKey;
  return PAGES.includes(h) ? h : "overview";
}

function Pages({ page, go }: { page: PageKey; go: (p: PageKey) => void }) {
  const { base, baseError } = useStore();
  const { tx } = useLang();
  if (baseError) return <ErrorBox error={baseError} />;
  if (!base) return <Loading label={tx("Loading the precomputed analysis…", "Cargando el análisis precalculado…")} />;
  switch (page) {
    case "overview": return <Overview a={base} go={go} />;
    case "advisor": return <Advisor />;
    case "model": return <Model />;
    case "profile": return <ProfilePage a={base} />;
    case "portfolio": return <PortfolioPage a={base} />;
    case "policies": return <Policies a={base} />;
    case "evaluation": return <Evaluation a={base} />;
    case "recommendation": return <Recommendation a={base} go={go} />;
    case "data": return <DataPage a={base} />;
  }
}

export default function App() {
  const [page, setPage] = useState<PageKey>(readHash);
  const [open, setOpen] = useState(false);
  const { tx, lang } = useLang();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    const onHash = () => setPage(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (p: PageKey) => {
    setPage(p);
    setOpen(false);
    if (window.location.hash !== `#${p}`) window.history.pushState(null, "", `#${p}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <StoreProvider>
      <div className="shell">
        <header className="topbar">
          <Brand />
          <button className="btn ghost" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="sidebar">
            {tx("Menu", "Menú")}
          </button>
        </header>
        <aside id="sidebar" className={`side${open ? " open" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <Nav current={page} onNavigate={go} />
        </aside>
        {open && <div style={{ position: "fixed", inset: 0, zIndex: 35 }} onClick={() => setOpen(false)} aria-hidden="true" />}
        <main className="main">
          <div className="page">
            <Pages page={page} go={go} />
          </div>
        </main>
      </div>
    </StoreProvider>
  );
}
