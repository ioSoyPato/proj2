import { useI18n } from "../lib/i18n";
import type { Instance } from "../lib/api";

export interface GridSection {
  key: string; sid: string; course: number; cohort: string; pattern: number; room: number;
  instr_kind: string; instr: number; capacity?: number; enrolled?: number; origin?: string; status?: string;
}

export function instrName(inst: Instance, kind: string, i: number): string {
  if (kind === "ft") return inst.profs[i]?.name ?? "?";
  if (kind === "adj") return inst.adjuncts[i]?.name ?? "?";
  return "—";
}

export function shortName(full: string): string {
  const clean = full.replace(/^(Dr\.|M\.Sc\.|Lic\.)\s*/, "").replace(/\s*\(.*\)$/, "");
  const parts = clean.split(" ");
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : clean;
}

export function TimetableGrid({ inst, sections, isDim, onSelect, selected, compact }: {
  inst: Instance; sections: GridSection[]; isDim?: (s: GridSection) => boolean;
  onSelect?: (s: GridSection) => void; selected?: string | null; compact?: boolean;
}) {
  const { d, t, lang } = useI18n();
  const blocks = Array.from(new Set(inst.patterns.map((p) => p.block))).sort((a, b) => a - b);
  const pat = (dp: string, b: number) => inst.patterns.find((p) => p.daypair === dp && p.block === b)!;
  const byPattern = new Map<number, GridSection[]>();
  for (const s of sections) {
    const arr = byPattern.get(s.pattern) ?? [];
    arr.push(s);
    byPattern.set(s.pattern, arr);
  }
  return (
    <div style={{ overflowX: "auto", paddingBottom: "0.3rem" }}>
      <div className={`tt${compact ? " compact" : ""}`} style={{ gridTemplateColumns: compact ? "3rem 1fr 1fr" : "3.6rem 1fr 1fr" }} role="table" aria-label={t("Weekly timetable", "Horario semanal")}>
        <div />
        <div className="tt-head" role="columnheader">{d("mw")}</div>
        <div className="tt-head" role="columnheader">{d("tt")}</div>
        {blocks.map((b) => {
          const p0 = pat("MW", b);
          return [
            <div key={`t${b}`} className="tt-time" role="rowheader">{p0.start}<br /><span style={{ opacity: 0.7 }}>{p0.end}</span></div>,
            ...(["MW", "TT"] as const).map((dp) => {
              const p = pat(dp, b);
              const items = (byPattern.get(p.pattern) ?? []).slice().sort((a, b2) => a.cohort.localeCompare(b2.cohort));
              return (
                <div key={`${dp}${b}`} className="tt-cell" role="cell" style={{ minHeight: compact ? "3.2rem" : undefined }}>
                  {items.map((s) => {
                    const c = inst.courses[s.course];
                    const dim = isDim ? isDim(s) : false;
                    const fill = s.capacity ? Math.min(1, (s.enrolled ?? 0) / s.capacity) : null;
                    const cls = ["tt-block", dim ? "dim" : "", s.origin === "new" ? "new" : "", s.instr_kind === "" ? "orphan" : ""].join(" ");
                    const title = `${c.code} ${lang === "es" ? c.name_es : c.name_en} · ${s.cohort === "X" ? t("new section", "sección nueva") : s.cohort} · ${inst.rooms[s.room].rid} · ${instrName(inst, s.instr_kind, s.instr)}${s.capacity ? ` · ${s.enrolled ?? 0}/${s.capacity}` : ""}`;
                    return (
                      <button key={s.key} type="button" className={cls} title={title} aria-label={title}
                        onClick={() => onSelect?.(s)}
                        style={{ background: `var(--c-${s.cohort})`, color: s.cohort === "1B" || s.cohort === "3B" ? "#1f1d2b" : "#fff", boxShadow: selected === s.key ? "0 0 0 2px var(--ink)" : undefined }}>
                        <div className="code">{c.code}{s.cohort !== "X" ? ` ${s.cohort}` : " +"}</div>
                        {!compact && <div style={{ opacity: 0.92 }}>{inst.rooms[s.room].rid}</div>}
                        {!compact && <div style={{ opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.instr_kind ? shortName(instrName(inst, s.instr_kind, s.instr)) : t("no instructor", "sin docente")}</div>}
                        {fill !== null && <span className="tt-fill" style={{ width: `${fill * 100}%` }} />}
                      </button>
                    );
                  })}
                </div>
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}

export function CohortLegend({ cohorts }: { cohorts: string[] }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem", fontSize: "0.82rem", color: "var(--ink-soft)" }}>
      {cohorts.map((c) => <span key={c}><span className="dot" style={{ background: `var(--c-${c})` }} />{c}</span>)}
      <span><span className="dot" style={{ background: "var(--c-X)", outline: "2px dashed var(--ink)", outlineOffset: -2 }} />{t("opened during registration", "abierta durante inscripciones")}</span>
    </div>
  );
}
