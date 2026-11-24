// Empty string = same-origin ("/api/..."), used by the single Docker image.
// Local two-terminal development sets VITE_API_BASE=http://localhost:8002 in .env.
export const API_BASE = (import.meta.env.VITE_API_BASE as string) || "";

export type PolicyKey = "fixed" | "pfa" | "dla" | "rl";
export const POLICY_KEYS: PolicyKey[] = ["fixed", "pfa", "dla", "rl"];

export interface Market {
  capacity: number;
  horizon: number;
  price_min: number;
  price_max: number;
  price_step: number;
  total_arrivals: number;
  demand_sigma: number;
  arrival_decay: number | null;
  wtp_median: number;
  wtp_sigma: number;
  ref_init: number;
  theta: number;
  eta: number;
  gamma: number;
  kappa: number;
}

export interface Paired { mean: number; sd: number; ci95: [number, number]; win_rate: number; pct: number | null }

export interface Summary {
  n: number;
  revenue: { mean: number; std: number; se: number; ci95: [number, number]; p5: number; p25: number; p50: number; p75: number; p95: number; min: number; max: number };
  sellout: { prob: number; ci95: [number, number]; mean_days_left_at_sellout: number | null };
  tickets: { mean_sold: number; load_factor: number; p5_sold: number; mean_unsold: number };
  avg_price_paid: number | null;
  price_path: { mean: number[]; p10: number[]; p90: number[]; median_scenario: number[] };
  seats_path: { mean: number[]; median_scenario: number[] };
  sales_path: { mean: number[] };
  ref_path: { mean: number[] };
  first_price: number;
  histogram: { counts: number[]; edges: number[] };
  paired_vs_fixed: Paired | null;
}

export interface PolicyOut {
  key: PolicyKey;
  class: "baseline" | "PFA" | "DLA" | "VFA";
  tunables: Record<string, number | string | null>;
  summary: Summary;
}

export interface RlStatus {
  included: boolean;
  ood: boolean;
  reason: string;
  worst_rel_change?: number;
  deviations: Record<string, { trained: number; now: number; rel: number }>;
  train_meta?: { best_val_revenue: number; train_seconds: number; episodes: number;
    history: { round: number; episodes: number; epsilon: number; val_revenue: number; seconds: number }[] } | null;
}

export interface Recommendation {
  policy: PolicyKey;
  best_mean: PolicyKey;
  statistically_tied_with_best: PolicyKey[];
  rule: "best_mean" | "simplest_within_ci";
  runner_up: PolicyKey | null;
  edge_vs_runner_up: Paired | null;
  edge_vs_baseline: Paired | null;
}

export interface SolverInfo {
  preferred: "gurobi" | "highs";
  version: string;
  licence: string;
  fallback: string | null;
  gurobi_unavailable_reason?: string;
  solves?: Record<string, number>;
}

export interface SweepRow {
  value: number;
  recommended: PolicyKey;
  best_mean: PolicyKey;
  rl_ood: boolean;
  fixed_price: number;
  pfa_params: { p0: number; drift: number; k: number };
  policies: Partial<Record<PolicyKey, { mean: number; se: number; p5: number; p95: number; sellout: number; gain_vs_fixed: Paired | null }>>;
}

export interface Sensitivity {
  n_scenarios: number;
  seed_family: number;
  sweeps: Record<string, SweepRow[]>;
  live?: boolean;
  seconds?: number;
}

export interface Study {
  params: Market & { arrival_shape_source: string; scarcity_frac: number };
  grid: number[];
  arrival_rates: number[];
  seeds: { tuning_family: number; eval_family: number; n_tune: number; n_tune_dla: number; n_eval: number; rl_train_family: number | null };
  policies: Partial<Record<PolicyKey, PolicyOut>>;
  order: PolicyKey[];
  fixed_price_curve: { price: number; mean_revenue: number; sellout_prob: number }[];
  pfa_tuning: { evaluations: number; tuning_mean_revenue: number; seconds: number };
  dla_tuning: { prior_n0: number | null; mean_revenue: number }[] | null;
  dla_plan_day0: number[];
  rl: RlStatus;
  recommendation: Recommendation;
  solver: SolverInfo;
  timings: Record<string, number>;
  sensitivity?: Sensitivity;
  generated_at?: string;
  total_seconds?: number;
  calibration?: { is_real_data: boolean; route: string | null; b: number };
  live?: boolean;
  seconds?: number;
}

export interface Meta {
  defaults: Market & { arrival_shape_source: string };
  default_arrival_decay_uncalibrated: number;
  grid: number[];
  arrival_rates: number[];
  calibration: { is_real_data: boolean; route: string | null; b: number };
  credentials: { kaggle: boolean; flight_prices_csv: boolean; gurobi_license_file: boolean };
  solver: SolverInfo;
  rl: RlStatus;
  precomputed: { available: boolean; generated_at: string | null; calibration_used: { is_real_data: boolean; b: number } | null };
}

export interface Calibration {
  is_real_data: boolean;
  default_b?: number;
  how_to?: string;
  provenance?: { dataset: string; source: string; route: string; routes: string[]; nonstop_only: boolean;
    bytes_scanned: number; lines_scanned: number; rows_kept: number; stopped_early: boolean; created_at: string };
  fit?: { model: string; a: number; b: number; se_b: number; b_ci90: [number, number] | null; n_boot: number;
    r2_weighted: number; rmse: number; last_to_first_day_ratio: number };
  curve?: { d: number[]; y: number[]; n: number[]; fitted: number[]; residuals: number[]; mean_fare: (number | null)[] };
  per_route?: Record<string, { b?: number; a?: number; r2_weighted?: number; n_flights?: number; n_pairs?: number; error?: string }>;
  sample?: { n_flights: number; n_snapshots: number; n_pairs: number; seat_display_cap: number;
    search_date_range: [string, string]; flight_date_range: [string, string] };
}

export interface Decision {
  t: number;
  days_left: number;
  fixed: { price: number };
  pfa: { price: number; booking_curve_target: number };
  dla: { price: number; plan: number[]; expected_sales: number[]; expected_revenue: number; demand_level_belief: number; solver: string };
  rl: { price: number | null; ood: boolean; reason?: string };
}

export interface DecisionState { days_left: number; seats_left: number; ref_price: number; last_sales: number; pace: number }

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

const post = <T,>(path: string, body: unknown) => jsonFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  meta: () => jsonFetch<Meta>("/api/meta"),
  precomputed: () => jsonFetch<Study>("/api/precomputed"),
  calibration: () => jsonFetch<Calibration>("/api/calibration"),
  evaluate: (market: Market, n_scenarios: number) => post<Study>("/api/evaluate", { market, n_scenarios }),
  sensitivity: (market: Market, parameter: string, n_scenarios: number) =>
    post<Sensitivity>("/api/sensitivity", { market, parameter, n_scenarios }),
  decide: (market: Market, state: DecisionState, tuned: { fixed_price?: number; pfa?: Record<string, number>; dla_n0?: number | null }) =>
    post<Decision>("/api/decide", { market, state, tuned }),
};
