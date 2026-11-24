import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Calibration, type Market, type Meta, type Study } from "./api";

interface DataCtx {
  meta: Meta | null;
  pre: Study | null;
  cal: Calibration | null;
  error: string | null;
  reload: () => void;
  // the dashboard's live run survives page switches
  live: Study | null;
  setLive: (s: Study | null) => void;
  market: Market | null;
  setMarket: (m: Market) => void;
}

const Ctx = createContext<DataCtx | null>(null);

export function marketFrom(meta: Meta): Market {
  const d = meta.defaults;
  return {
    capacity: d.capacity, horizon: d.horizon, price_min: d.price_min, price_max: d.price_max,
    price_step: d.price_step, total_arrivals: d.total_arrivals, demand_sigma: d.demand_sigma,
    arrival_decay: null, wtp_median: d.wtp_median, wtp_sigma: d.wtp_sigma, ref_init: d.ref_init,
    theta: d.theta, eta: d.eta, gamma: d.gamma, kappa: d.kappa,
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [pre, setPre] = useState<Study | null>(null);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Study | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([api.meta(), api.precomputed(), api.calibration()])
      .then(([m, p, c]) => {
        if (!alive) return;
        setMeta(m); setPre(p); setCal(c);
        setMarket((cur) => cur ?? marketFrom(m));
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return (
    <Ctx.Provider value={{ meta, pre, cal, error, reload, live, setLive, market, setMarket }}>{children}</Ctx.Provider>
  );
}

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useData outside DataProvider");
  return c;
}
