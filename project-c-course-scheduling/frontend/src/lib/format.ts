import type { Lang } from "./i18n";

const loc = (l: Lang) => (l === "es" ? "es-MX" : "en-US");
export const money = (x: number, l: Lang, digits = 0) =>
  new Intl.NumberFormat(loc(l), { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(x);
export const kmoney = (x: number, l: Lang) => `${money(x / 1000, l, 1)}k`;
export const num = (x: number, l: Lang, digits = 0) =>
  new Intl.NumberFormat(loc(l), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
export const pct = (x: number, l: Lang, digits = 0) =>
  new Intl.NumberFormat(loc(l), { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
export const sec = (x: number, l: Lang) => `${num(x, l, x < 1 ? 2 : 1)} s`;
