import type { ActionRec, EventRec, Instance, SecSnap } from "./api";
import type { Lang } from "./i18n";

function instr(inst: Instance, kind?: string, i?: number) {
  if (kind === "ft" && i !== undefined) return inst.profs[i]?.name ?? "?";
  if (kind === "adj" && i !== undefined) return inst.adjuncts[i]?.name ?? "?";
  return "?";
}
function pat(inst: Instance, k: number | undefined, lang: Lang) {
  if (k === undefined) return "";
  const p = inst.patterns[k];
  const dp = p.daypair === "MW" ? (lang === "es" ? "Lun–Mié" : "Mon–Wed") : (lang === "es" ? "Mar–Jue" : "Tue–Thu");
  return `${dp} ${p.start}`;
}

/** Plain-language sentence for one decision. */
export function describeAction(a: ActionRec, inst: Instance, lang: Lang, secs: SecSnap[]): string {
  const es = lang === "es";
  const sid = (i?: number) => secs.find((s) => s.idx === i)?.sid ?? `#${i}`;
  const cname = (c?: number) => (c === undefined || c < 0 ? "" : `${inst.courses[c].code} ${es ? inst.courses[c].name_es : inst.courses[c].name_en}`);
  const room = (r?: number) => (r === undefined ? "" : inst.rooms[r].rid);
  switch (a.kind) {
    case "open":
      return es
        ? `Abrir una sección nueva de ${cname(a.course)} con ${instr(inst, a.instr_kind, a.instr)}, ${pat(inst, a.pattern, lang)}, salón ${room(a.room)} (${inst.rooms[a.room!].capacity} lugares).`
        : `Open a new section of ${cname(a.course)} with ${instr(inst, a.instr_kind, a.instr)}, ${pat(inst, a.pattern, lang)}, room ${room(a.room)} (${inst.rooms[a.room!].capacity} seats).`;
    case "hire":
      return es
        ? `Contratar a ${instr(inst, "adj", a.instr)}${a.course !== undefined && a.course >= 0 ? ` (para ${inst.courses[a.course].code})` : ""}; puede dar clase dentro de 2 semanas.`
        : `Hire ${instr(inst, "adj", a.instr)}${a.course !== undefined && a.course >= 0 ? ` (for ${inst.courses[a.course].code})` : ""}; available to teach in 2 weeks.`;
    case "cancel":
      return es ? `Cancelar ${sid(a.section)} y reubicar a sus alumnos en las otras secciones del curso.` : `Cancel ${sid(a.section)} and re-seat its students in the course's other sections.`;
    case "merge":
      return es ? `Fusionar ${sid(a.section)} con ${sid(a.target)}.` : `Merge ${sid(a.section)} into ${sid(a.target)}.`;
    case "move":
      return es ? `Mover ${sid(a.section)} al salón ${room(a.room)} (${inst.rooms[a.room!].capacity} lugares), mismo horario.` : `Move ${sid(a.section)} to room ${room(a.room)} (${inst.rooms[a.room!].capacity} seats), same time.`;
    case "assign":
      return es ? `Asignar ${instr(inst, a.instr_kind, a.instr)} a ${sid(a.section)}, que se quedó sin profesor (mismo horario).` : `Give ${sid(a.section)}, which lost its professor, to ${instr(inst, a.instr_kind, a.instr)} (same time).`;
    case "reschedule":
      return es
        ? `Reprogramar ${sid(a.section)} (sin profesor) a ${pat(inst, a.pattern, lang)}, salón ${room(a.room)}, con ${instr(inst, a.instr_kind, a.instr)}; sus alumnos cambian de horario.`
        : `Re-time ${sid(a.section)} (no professor) to ${pat(inst, a.pattern, lang)}, room ${room(a.room)}, with ${instr(inst, a.instr_kind, a.instr)}; its students change time.`;
    default:
      return a.kind;
  }
}

export function describeEvent(e: EventRec, inst: Instance, lang: Lang): string {
  const es = lang === "es";
  if (e.type === "prof_unavailable") {
    const n = inst.profs[e.prof!].name;
    return es ? `${n} queda indisponible el resto del semestre; sin profesor: ${(e.sections ?? []).join(", ") || "ninguna sección"}.`
      : `${n} becomes unavailable for the semester; left without a professor: ${(e.sections ?? []).join(", ") || "no sections"}.`;
  }
  if (e.type === "orphan_cancelled") {
    return es ? `${e.section} se cancela al inicio de clases por no tener profesor; ${e.unplaced} alumnos se quedan sin lugar.`
      : `${e.section} is cancelled at the start of classes because it has no professor; ${e.unplaced} students are left without a seat.`;
  }
  return e.type;
}
