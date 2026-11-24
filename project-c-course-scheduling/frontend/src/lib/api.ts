// Empty string = same-origin "/api/..." (single Docker image). Local dev sets
// VITE_API_BASE=http://localhost:8003 in frontend/.env.
export const API_BASE = (import.meta.env.VITE_API_BASE as string) || "";

export type PolicyName = "baseline" | "pfa" | "dla" | "rl";
export const POLICIES: PolicyName[] = ["baseline", "pfa", "dla", "rl"];

export interface Course {
  idx: number; code: string; name_en: string; name_es: string; semester: number; area: string; lab: boolean;
  n_sections: number; forecast: number; sigma_rel: number; slope: number;
  history: { year: number; enrolled: number }[];
  backtest_pred: number; backtest_ape: number; naive_ape: number; mean_ape: number;
  qualified_profs: number[]; qualified_adjuncts: number[];
}
export interface Prof { idx: number; pid: string; name: string; area: string; qualified: number[]; primary: number[]; min_hours: number; max_hours: number; preferred: number[]; unavailable: number[]; }
export interface Adjunct { idx: number; aid: string; name: string; qualified: number[]; cost_per_section: number; lead_time: number; max_sections: number; available: number[]; }
export interface Room { idx: number; rid: string; name: string; capacity: number; is_lab: boolean; }
export interface Pattern { pattern: number; daypair: "MW" | "TT"; block: number; start: string; end: string; label: string; }
export interface CostSettings { penalty_unserved: number; penalty_change: number; ft_section_cost: number; adjunct_hire_fee: number; room_base: number; room_per_seat: number; room_move_admin: number; budget: number; }
export interface ScenSettings { demand_multiplier: number; demand_volatility: number; common_share: number; unavailability_prob: number; renege_prob: number; drop_prob: number; profile_concentration: number; }
export interface Settings { cost: CostSettings; scen: ScenSettings; }

export interface Instance {
  meta: { synthetic: boolean; generator_seed: number; note: string };
  source: string;
  courses: Course[];
  sections: { idx: number; sid: string; course: number; cohort: string; forecast: number }[];
  profs: Prof[]; adjuncts: Adjunct[]; rooms: Room[]; patterns: Pattern[]; cohorts: string[];
  params: { settings: Settings; arrival_profile: number[]; n_weeks: number; cancel_from_week: number; edge_blocks: number[] };
  totals: { forecast_students: number; ft_section_capacity: number; ft_min_sections: number };
}

export interface SolveResult { status: string; objective: number | null; bound: number | null; gap: number | null; solver: string; seconds: number; n_vars: number; n_cons: number; n_binary: number; note: string; }
export interface Breakdown { counts: { pref: number; edge: number; primary: number; lab: number; seat: number }; weighted_total: number; }
export interface Row { section: number; prof: number; room: number; pattern: number; }
export interface Phase1 {
  chosen: string; weights: Record<string, number>; timetable: Row[];
  monolithic: { result: SolveResult; breakdown: Breakdown; violations: string[] };
  decomposed: { info: { status: string; iterations: number; cuts: number; seconds: number; stage_a: SolveResult[]; stage_b: SolveResult }; breakdown: Breakdown; timetable: Row[]; violations: string[] };
}

export interface Describe { mean: number; std: number; p5: number; p50: number; p95: number; ci_lo: number; ci_hi: number; n: number; min: number; max: number; }
export interface PolicyResult { name: PolicyName; class: string; label: string; params: Record<string, number>; stats: Record<string, Describe>; }
export interface SensEntry { factor: string; value: number; is_base: boolean; best: PolicyName; runner_up: PolicyName; significant: boolean; gap_to_runner_up: { mean: number; ci_lo: number; ci_hi: number }; policies: { name: PolicyName; mean_cost: number; ci_lo: number; ci_hi: number; mean_unserved: number; mean_changed: number }[]; }
export interface Results {
  meta: { generated_at: string; n_eval: number; n_tune_pfa: number; n_tune_dla: number; n_sens: number; seed_ranges: Record<string, [number, number]>; crn_verified: boolean; settings: Settings; timing_seconds: Record<string, number>; total_seconds: number; workers: number };
  tuning: {
    pfa_grid: { N: number; M: number; mean_cost: number; ci_half: number; mean_unserved: number; mean_changed: number }[];
    pfa_best: { N: number; M: number; mean_cost: number };
    dla_grid: { theta: number; mean_cost: number; ci_half: number; mean_unserved: number; mean_changed: number }[];
    dla_best: { theta: number; mean_cost: number };
    rl: { episodes: number; seconds: number; states_visited: number; n_states: number; curve: { episode: number; mean_cost: number; epsilon: number }[]; actions: string[] };
  };
  policies: PolicyResult[];
  best: PolicyName;
  paired_vs_best: Record<string, Describe & { share_a_better: number }>;
  paired_unserved_vs_best: Record<string, Describe & { share_a_better: number }>;
  dla_solve: { n_solves: number; mean_seconds: number; max_seconds: number; mean_vars: number; max_vars: number; optimal_share: number };
  scenarios: Record<PolicyName, { total_cost: number[]; unserved: number[] }>;
  sensitivity: SensEntry[];
  rl_policy_map: { week: number; wait: number; gap: number; action: number | null; visits: number }[];
  rl_actions: string[];
}

export interface SecSnap { idx: number; sid: string; course: number; cohort: string; instr_kind: string; instr: number; room: number; pattern: number; capacity: number; enrolled: number; status: string; origin: string; active_from: number; }
export interface Snapshot { sections: SecSnap[]; waitlist: number[]; requests: number[]; lost: number[]; budget: number; adjuncts: { hired_week: number; arrival: number; load: number }[]; profs_gone: number[]; }
export interface ActionRec { kind: string; course?: number; section?: number; target?: number; instr_kind?: string; instr?: number; room?: number; pattern?: number; }
export interface EventRec { week: number; type: string; prof?: number; sections?: string[]; section?: string; unplaced?: number; }
export interface WeekLog { week: number; state: Snapshot; actions: ActionRec[]; after: Snapshot; events: EventRec[]; plan: Record<string, number | string> | null; }
export interface Outcome { total_cost: number; instructor_cost: number; adjunct_fees: number; room_cost: number; move_admin: number; unserved_penalty: number; change_penalty: number; unserved: number; changed: number; demand: number; served_share: number; sections_running: number; sections_opened: number; sections_cancelled: number; adjuncts_hired: number; budget_left: number; prof_events: number; orphans_cancelled: number; }
export interface Episode { policy: PolicyName; params: Record<string, number>; seed: number; settings: Settings; outcome: Outcome; weeks: WeekLog[]; seconds: number; demand: number[]; }

export interface LiveEval {
  live: true; n_scenarios: number; seconds: number; settings: Settings; best: PolicyName;
  policies: PolicyResult[];
  paired_vs_best: Record<string, Describe & { share_a_better: number }>;
  scenarios: Record<string, { total_cost: number[]; unserved: number[] }>;
}

export interface Inputs {
  penalty_unserved?: number; penalty_change?: number; demand_multiplier?: number; demand_volatility?: number;
  unavailability_prob?: number; budget?: number; N?: number; M?: number; theta?: number;
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

export const api = {
  instance: () => j<Instance>("/api/instance"),
  phase1: () => j<Phase1>("/api/phase1"),
  results: () => j<Results>("/api/results"),
  episode: (body: Inputs & { policy: PolicyName; seed?: number }) => j<Episode>("/api/episode", { method: "POST", body: JSON.stringify(body) }),
  evaluate: (body: Inputs & { n_scenarios: number; policies?: PolicyName[] }) => j<LiveEval>("/api/evaluate", { method: "POST", body: JSON.stringify(body) }),
};
