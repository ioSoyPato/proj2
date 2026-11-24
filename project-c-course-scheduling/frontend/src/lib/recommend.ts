import type { PolicyName, Results } from "./api";

export function ranking(r: { policies: { name: PolicyName; stats: Record<string, { mean: number }> }[] }): PolicyName[] {
  return [...r.policies].sort((a, b) => a.stats.total_cost.mean - b.stats.total_cost.mean).map((p) => p.name);
}

/** Factors under which the best policy changes, read off the sensitivity runs. */
export function switches(r: Results): { factor: string; value: number; best: PolicyName }[] {
  return r.sensitivity.filter((s) => s.best !== r.best && !s.is_base).map((s) => ({ factor: s.factor, value: s.value, best: s.best }));
}
