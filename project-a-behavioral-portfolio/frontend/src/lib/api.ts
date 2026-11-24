// Empty string = same-origin relative requests ("/api/..."), used by the single
// Docker image. Local development sets VITE_API_BASE=http://localhost:8001 in
// frontend/.env.
export const API_BASE = (import.meta.env.VITE_API_BASE as string) || "";

export type PolicyKey = "buy_hold" | "pfa_band" | "cfa_milp" | "panic" | "chaser" | "unassisted";
export const POLICY_ORDER: PolicyKey[] = ["buy_hold", "pfa_band", "cfa_milp", "panic", "chaser", "unassisted"];

export interface Describe {
  mean: number; std: number; p5: number; p25: number; median: number; p75: number; p95: number;
  ci_low: number; ci_high: number; n: number; share_positive?: number;
}

export interface Question {
  id: string; block: "alpha" | "beta" | "lambda" | "bias"; stake: number;
  options: number[]; default: number; param: string;
}

export interface ProfileOut {
  alpha: number; beta: number; lam: number;
  panic_drawdown: number; reentry_recovery: number; chase_intensity: number; review_months: number;
  risk_label: "low" | "moderate" | "high" | "very_high";
  cvar_cap: number;
  value_curve: { x: number[]; v: number[] };
  detail: {
    answers: Record<string, number>;
    alpha_by_question: Record<string, number>;
    beta_by_question: Record<string, number>;
    lambda_by_question: Record<string, number>;
  };
}

export interface Holding { ticker: string; name: string; asset_class: string; weight: number; dollars: number }

export interface Portfolio {
  holdings: Holding[];
  by_class: { asset_class: string; weight: number }[];
  expected_return_annual: number; expected_return_shrunk_annual: number; volatility_annual: number;
  cvar_monthly: number; cvar_monthly_empirical: number; var_monthly: number; cvar_cap: number;
  cap_binding: boolean; feasible_cap: boolean; n_selected: number;
  solver: string; status: string; solve_seconds: number;
  params: { cvar_cap: number; cvar_level: number; max_assets: number; min_weight: number; max_weight: number; max_class_weight: number; shrinkage: number };
}

export interface FrontierPoint { cvar_cap: number; cvar: number; expected_return_annual: number; volatility_annual: number }

export interface PolicySummary {
  class: string; kind: "optimizing" | "behavioral";
  pt_value: Describe; pt_certainty_equivalent: number;
  terminal_wealth: Describe; cagr: Describe;
  prob_below_reference: number; prob_loss: number; max_drawdown: Describe;
  annual_turnover: number; mean_costs: number; mean_cash_months: number; mean_trades: number;
  fan: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
}

export interface BehaviorCost {
  median_wealth_diff: number; wealth_diff: Describe; pt_diff: Describe; pt_ce_diff: number; share_affected: number;
}

export interface Scores { mean_pt: number; ci_half: number; median_wealth: number; p5_wealth: number }

export interface Sensitivity {
  seed: number;
  lambda: { lam: number; cvar_cap: number; equity_share: number; band: number; scores: Record<string, Scores>; best: PolicyKey; unassisted_median_cost: number }[];
  cost: { cost: number; band: number; scores: Record<string, Scores>; best: PolicyKey; cfa_mean_costs: number }[];
  reference: { target_growth: number; reference: number; band: number; scores: Record<string, Scores>; best: PolicyKey; prob_below_reference: Record<string, number> }[];
  panic: { d: number; r: number; median_diff: number; mean_diff: number; ci_low: number; ci_high: number; pt_diff: number; share_affected: number; cash_months: number }[];
  chase: { k: number; f: number; median_diff: number; mean_diff: number; ci_low: number; ci_high: number; pt_diff: number; share_affected: number }[];
}

export interface Analysis {
  data: {
    source: string; synthetic: boolean; tickers: string[]; names: Record<string, string>;
    asset_class: Record<string, string>; classes: string[]; start: string; end: string;
    n_months: number; downloaded_at: string;
  };
  profile: ProfileOut;
  settings: {
    initial_wealth: number; target_growth: number; horizon_months: number; max_assets: number;
    max_weight: number; min_weight: number; max_class_weight: number; cost: number;
    n_eval: number; n_tune: number; tuning_seed: number; eval_seed: number;
    cfa: { lookback: number; theta: number }; reference: number;
  };
  portfolio: Portfolio;
  frontier: FrontierPoint[];
  tuning: {
    seed: number; n: number;
    band_grid: { band: number | null; mean_pt: number; median_wealth: number; annual_turnover: number }[];
    band_selected: number;
    cfa_grid: { lookback: number; theta: number; mean_pt: number; median_wealth: number }[];
    cfa_selected: { lookback: number; theta: number };
    cfa_tuned_live: boolean;
  };
  evaluation: {
    seed: number; n: number; horizon_months: number;
    policies: Record<PolicyKey, PolicySummary>;
    histogram: { edges: number[]; counts: Record<PolicyKey, number[]> };
  };
  behavior_cost: Record<"panic" | "chaser" | "unassisted", BehaviorCost>;
  recommendation: {
    policy: PolicyKey; tied_with: PolicyKey[];
    comparisons: Record<string, { pt_diff: Describe; wealth_diff: Describe }>;
  };
  solver: string;
  timings: Record<string, number>;
  sensitivity?: Sensitivity;
  precomputed?: boolean;
}

export interface Meta {
  data: { tickers: string[]; names: Record<string, string>; asset_class: Record<string, string>; classes: string[]; return_start: string; return_end: string; n_months: number; downloaded_at: string; source: string; synthetic: boolean };
  questions: Question[];
  seeds: { tuning: number; evaluation: number; sensitivity: number };
  defaults: Record<string, unknown>;
  solver: string;
  cfa_tuned: { lookback: number; theta: number };
}

export interface AnalyzeBody {
  answers: Record<string, number>;
  initial_wealth: number; target_growth: number; max_assets: number; max_weight: number;
  max_class_weight: number; cost_bp: number; n_scenarios: number;
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => jsonFetch<Meta>("/api/meta"),
  defaultAnalysis: () => jsonFetch<Analysis>("/api/default"),
  profile: (answers: Record<string, number>) =>
    jsonFetch<ProfileOut>("/api/profile", { method: "POST", body: JSON.stringify({ answers }) }),
  analyze: (body: AnalyzeBody) =>
    jsonFetch<Analysis>("/api/analyze", { method: "POST", body: JSON.stringify(body) }),
};
