// Read-only course model for the counsellor Courses screens. Mirrors the shape of
// GET /courses (AcademicsService.listCourses) and GET /courses/:id; every display
// value is derived from real columns, nothing is invented.

export interface ApiCourseRow {
  id: number | string;
  title: string | null;
  short_name: string | null;
  level: string | null;
  /** The UNIT ("Year" / "Semester" / "Month") on legacy rows. */
  duration: string | null;
  /** The MAGNITUDE ("2") on legacy rows. */
  total_duration: string | null;
  specialisations: string | null;
  study_mode?: string | null;
  eligibility_criteria?: string | null;
  university_id: number | string | null;
  university_name?: string | null;
  mapped_universities_count?: number | null;
  status: number | string | null;
}

export interface CourseView {
  id: number;
  code: string;
  name: string;
  group: string;
  level: string;
  duration: string;
  mode: string;
  eligibility: string;
  specialisations: string[];
  university: string;
  universities: number;
  /** false only when the course is explicitly inactive (status 0). */
  active: boolean;
}

export const NONE = "—";

export function parseSpecialisationNames(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (text === "") return [];
  const fromItem = (item: unknown): string => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const name = rec.name ?? rec.title ?? rec.label;
      return typeof name === "string" ? name : "";
    }
    return "";
  };
  if (text.startsWith("[") || text.startsWith("{") || text.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.map(fromItem).map((n) => n.trim()).filter((n) => n !== "");
    } catch {
      // not JSON after all: fall through to the plain-string reading
    }
  }
  return text.split(/[,\n]/).map((n) => n.trim()).filter((n) => n !== "");
}

export function formatDuration(unit: string | null | undefined, magnitude: string | null | undefined): string {
  const u = (unit ?? "").trim();
  const m = (magnitude ?? "").trim();
  if (u === "" && m === "") return NONE;
  if (m === "") return u;
  if (u === "" || /^\d/.test(u)) return u || m;
  return `${m} ${u}`;
}

const clean = (v: string | null | undefined) => (v != null && v.trim() !== "" ? v.trim() : NONE);

export function mapCourse(r: ApiCourseRow): CourseView {
  const id = Number(r.id);
  const specs = parseSpecialisationNames(r.specialisations);
  const status = r.status == null || String(r.status).trim() === "" ? null : Number(r.status);
  return {
    id,
    code: `CRS-${String(r.id).padStart(4, "0")}`,
    name: (r.title ?? "").trim() || (r.short_name ?? "").trim() || `Course #${id}`,
    group: clean(r.short_name),
    level: clean(r.level),
    duration: formatDuration(r.duration, r.total_duration),
    mode: clean(r.study_mode),
    eligibility: clean(r.eligibility_criteria),
    specialisations: specs,
    university: clean(r.university_name),
    universities: Number(r.mapped_universities_count ?? 0),
    active: status !== 0,
  };
}

/** Duration in months for sorting ("2 Year" -> 24); 0 when unparseable. */
export function monthsOf(duration: string): number {
  const n = parseInt(duration, 10);
  if (Number.isNaN(n)) return 0;
  return /year/i.test(duration) ? n * 12 : n;
}

export const MODE_STYLES: Record<string, string> = {
  online: "bg-info-soft text-info border-transparent",
  offline: "bg-muted text-muted-foreground border-transparent",
  hybrid: "bg-primary-soft text-primary-soft-foreground border-transparent",
};

export function modeStyle(mode: string): string {
  return MODE_STYLES[mode.toLowerCase()] ?? "bg-muted text-muted-foreground border-transparent";
}
