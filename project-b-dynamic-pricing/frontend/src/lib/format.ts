import type { Lang } from "./i18n";

const loc = (lang: Lang) => (lang === "en" ? "en-US" : "es-MX");

export function money(x: number | null | undefined, lang: Lang, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return "$" + x.toLocaleString(loc(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** $213.4k style for big totals. */
export function kMoney(x: number | null | undefined, lang: Lang, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const sign = x < 0 ? "−" : "";
  const a = Math.abs(x);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toLocaleString(loc(lang), { maximumFractionDigits: 2 })}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toLocaleString(loc(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits })}k`;
  return `${sign}$${a.toFixed(0)}`;
}

export function signedK(x: number | null | undefined, lang: Lang, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return (x >= 0 ? "+" : "") + kMoney(x, lang, digits).replace("−", "−");
}

export function pct(x: number | null | undefined, lang: Lang, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return (x * 100).toLocaleString(loc(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";
}

export function signedPct(x: number | null | undefined, lang: Lang, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return (x >= 0 ? "+" : "−") + pct(Math.abs(x), lang, digits);
}

export function num(x: number | null | undefined, lang: Lang, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toLocaleString(loc(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
