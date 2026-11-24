// Plain-language sentences generated from study numbers (both languages).
import type { PolicyKey, Study } from "./api";
import type { Lang } from "./i18n";
import { kMoney, pct, signedPct } from "./format";

const NAMES: Record<Lang, Record<PolicyKey, string>> = {
  en: { fixed: "the fixed price", pfa: "the price-schedule rule", dla: "the daily lookahead", rl: "the RL agent" },
  es: { fixed: "el precio fijo", pfa: "la regla de calendario", dla: "la anticipación diaria", rl: "el agente RL" },
};

export function policyPhrase(k: PolicyKey, lang: Lang) {
  return NAMES[lang][k];
}

export function recommendationWhy(s: Study, lang: Lang): string {
  const r = s.recommendation;
  const pol = s.policies[r.policy]!.summary;
  const base = s.policies.fixed!.summary;
  const name = NAMES[lang][r.policy];
  const gain = r.edge_vs_baseline;
  const parts: string[] = [];
  if (lang === "en") {
    if (r.policy === "fixed") {
      parts.push(`No dynamic policy beats a single well-chosen price by a statistically clear margin here, so keep it simple: charge ${"$" + pol.first_price} throughout.`);
    } else {
      parts.push(`Across ${pol.n.toLocaleString("en-US")} simulated selling seasons, ${name} earns ${kMoney(pol.revenue.mean, lang)} on average, ${signedPct(gain?.pct ?? 0, lang)} versus the best fixed price (${kMoney(base.revenue.mean, lang)}), and wins in ${pct(gain?.win_rate ?? 0, lang)} of the same scenarios.`);
    }
    if (r.rule === "simplest_within_ci") {
      parts.push(`${cap(NAMES.en[r.best_mean])} has a slightly higher average, but the difference is inside the 95% confidence interval, so the simpler policy is recommended.`);
    } else if (r.runner_up && r.edge_vs_runner_up) {
      const e = r.edge_vs_runner_up;
      parts.push(`Its lead over ${NAMES.en[r.runner_up]} is ${kMoney(e.mean, lang)} per event (95% CI ${kMoney(e.ci95[0], lang)} to ${kMoney(e.ci95[1], lang)}).`);
    }
  } else {
    if (r.policy === "fixed") {
      parts.push(`Ninguna política dinámica supera con claridad estadística a un buen precio único, así que conviene lo simple: un precio de ${"$" + pol.first_price} todo el periodo.`);
    } else {
      parts.push(`En ${pol.n.toLocaleString("es-MX")} temporadas de venta simuladas, ${name} obtiene ${kMoney(pol.revenue.mean, lang)} en promedio, ${signedPct(gain?.pct ?? 0, lang)} frente al mejor precio fijo (${kMoney(base.revenue.mean, lang)}), y gana en el ${pct(gain?.win_rate ?? 0, lang)} de los mismos escenarios.`);
    }
    if (r.rule === "simplest_within_ci") {
      parts.push(`${cap(NAMES.es[r.best_mean])} tiene un promedio algo mayor, pero la diferencia cae dentro del intervalo de confianza del 95%, por lo que se recomienda la política más simple.`);
    } else if (r.runner_up && r.edge_vs_runner_up) {
      const e = r.edge_vs_runner_up;
      parts.push(`Su ventaja sobre ${NAMES.es[r.runner_up]} es de ${kMoney(e.mean, lang)} por evento (IC 95% de ${kMoney(e.ci95[0], lang)} a ${kMoney(e.ci95[1], lang)}).`);
    }
  }
  return parts.join(" ");
}

export function policyOneLiner(k: PolicyKey, s: Study, lang: Lang): string {
  const p = s.policies[k];
  if (!p) return "";
  const sm = p.summary;
  const g = sm.paired_vs_fixed;
  const so = pct(sm.sellout.prob, lang);
  const spread = `${kMoney(sm.revenue.p5, lang)}–${kMoney(sm.revenue.p95, lang)}`;
  if (lang === "en") {
    if (k === "fixed") return `One price all season. Average ${kMoney(sm.revenue.mean, lang)}; 90% of seasons land between ${spread}; sells out ${so} of the time.`;
    return `Average ${kMoney(sm.revenue.mean, lang)} (${signedPct(g?.pct ?? 0, lang)} vs fixed, better in ${pct(g?.win_rate ?? 0, lang)} of scenarios); 90% of seasons land between ${spread}; sells out ${so} of the time.`;
  }
  if (k === "fixed") return `Un solo precio toda la temporada. Promedio ${kMoney(sm.revenue.mean, lang)}; el 90% de las temporadas queda entre ${spread}; agota el ${so} de las veces.`;
  return `Promedio ${kMoney(sm.revenue.mean, lang)} (${signedPct(g?.pct ?? 0, lang)} vs fijo, mejor en el ${pct(g?.win_rate ?? 0, lang)} de los escenarios); el 90% de las temporadas queda entre ${spread}; agota el ${so} de las veces.`;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
