import { useI18n } from "../lib/i18n";
import type { Instance } from "../lib/api";
import type { GridSection } from "./TimetableGrid";

export interface Filter { kind: "none" | "prof" | "room" | "cohort"; value: string }

export function GridFilters({ inst, f, setF }: { inst: Instance; f: Filter; setF: (f: Filter) => void }) {
  const { d, t } = useI18n();
  const sel = (kind: Filter["kind"]) => (f.kind === kind ? f.value : "");
  const on = (kind: Filter["kind"]) => (e: React.ChangeEvent<HTMLSelectElement>) => setF(e.target.value ? { kind, value: e.target.value } : { kind: "none", value: "" });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", alignItems: "end", margin: "0.8rem 0" }}>
      <label className="small">{d("cohort")}<br />
        <select className="input" value={sel("cohort")} onChange={on("cohort")}>
          <option value="">{d("all")}</option>
          {inst.cohorts.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="small">{d("professor")}<br />
        <select className="input" value={sel("prof")} onChange={on("prof")}>
          <option value="">{d("all")}</option>
          {inst.profs.map((p) => <option key={p.idx} value={`ft:${p.idx}`}>{p.name}</option>)}
          {inst.adjuncts.map((a) => <option key={`a${a.idx}`} value={`adj:${a.idx}`}>{a.name}</option>)}
        </select>
      </label>
      <label className="small">{d("room")}<br />
        <select className="input" value={sel("room")} onChange={on("room")}>
          <option value="">{d("all")}</option>
          {inst.rooms.map((r) => <option key={r.idx} value={String(r.idx)}>{r.rid} ({r.capacity})</option>)}
        </select>
      </label>
      {f.kind !== "none" && <button className="btn ghost" onClick={() => setF({ kind: "none", value: "" })}>{t("Clear filter", "Quitar filtro")}</button>}
    </div>
  );
}

export function dimmer(f: Filter) {
  return (s: GridSection) => {
    if (f.kind === "none") return false;
    if (f.kind === "cohort") return s.cohort !== f.value;
    if (f.kind === "room") return String(s.room) !== f.value;
    return `${s.instr_kind}:${s.instr}` !== f.value;
  };
}
