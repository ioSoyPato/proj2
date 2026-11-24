import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type AnalyzeBody, type Analysis, type Meta } from "./api";

export interface ClientSettings {
  initial_wealth: number; target_growth: number; max_assets: number; max_weight: number;
  max_class_weight: number; cost_bp: number; n_scenarios: number;
}

export const DEFAULT_SETTINGS: ClientSettings = {
  initial_wealth: 100_000, target_growth: 0, max_assets: 8, max_weight: 0.3,
  max_class_weight: 0.45, cost_bp: 10, n_scenarios: 500,
};

interface Store {
  meta: Meta | null;
  base: Analysis | null;          // precomputed default-profile analysis (the report)
  baseError: string | null;
  answers: Record<string, number>;
  setAnswer: (id: string, v: number) => void;
  resetAnswers: () => void;
  settings: ClientSettings;
  setSettings: (s: ClientSettings) => void;
  live: Analysis | null;          // the client's own live run
  running: boolean;
  runError: string | null;
  run: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [base, setBase] = useState<Analysis | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<ClientSettings>(DEFAULT_SETTINGS);
  const [live, setLive] = useState<Analysis | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.meta(), api.defaultAnalysis()])
      .then(([m, a]) => {
        setMeta(m);
        setBase(a);
        setAnswers(Object.fromEntries(m.questions.map((q) => [q.id, q.default])));
      })
      .catch((e: Error) => setBaseError(e.message));
  }, []);

  const setAnswer = useCallback((id: string, v: number) => setAnswers((a) => ({ ...a, [id]: v })), []);
  const resetAnswers = useCallback(() => {
    if (meta) setAnswers(Object.fromEntries(meta.questions.map((q) => [q.id, q.default])));
  }, [meta]);

  const run = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const body: AnalyzeBody = { answers, ...settings };
      setLive(await api.analyze(body));
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [answers, settings]);

  const value = useMemo(
    () => ({ meta, base, baseError, answers, setAnswer, resetAnswers, settings, setSettings, live, running, runError, run }),
    [meta, base, baseError, answers, setAnswer, resetAnswers, settings, live, running, runError, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}
