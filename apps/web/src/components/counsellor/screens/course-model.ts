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
  /** course.total_amount — the course-level total fee (0/null when not set). */
  total_amount?: number | string | null;
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
  /** K6: course-level total fee in INR, or null when not set/zero. */
  fee: number | null;
  /** false only when the course is explicitly inactive (status 0). */
  active: boolean;
}

export const NONE = "—";

/**
 * K1: course eligibility_criteria holds rich HTML (lists, paragraphs, even <img>
 * tags that would load external images). The counsellor screens render it as plain
 * text, so the raw tags showed through. Convert it to readable inline text —
 * dropping <script>/<style>/<img> entirely (so no external image is ever requested)
 * and turning list items into "•" bullets. This never emits HTML, so there is no
 * XSS surface and no new dependency.
 */
export function htmlToText(raw: string | null | undefined): string {
  let s = (raw ?? "").toString();
  if (s.trim() === "") return "";
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<img[^>]*>/gi, "");
  s = s.replace(/<li[^>]*>/gi, " • ").replace(/<\/li>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&rsquo;|&apos;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"');
  s = s.replace(/\s*•\s*/g, " • ").replace(/\s+/g, " ").trim();
  return s.replace(/^•\s*/, "").trim();
}

/**
 * K2: specialisations is a Text column that may hold a JSON array of {id,name},
 * a plain comma/newline list, or (on some rows) a double-encoded JSON string.
 * Extract clean names from any of those shapes.
 */
export function parseSpecialisationNames(raw: string | null | undefined): string[] {
  let text = (raw ?? "").trim();
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
  // Up to two JSON layers: a double-encoded row is a JSON string that is itself JSON.
  for (let i = 0; i < 2; i++) {
    if (!(text.startsWith("[") || text.startsWith("{") || text.startsWith('"'))) break;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "string") {
        text = parsed.trim();
        continue;
      }
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.map(fromItem).map((n) => n.trim()).filter((n) => n !== "");
    } catch {
      break;
    }
  }
  // Not JSON: a plain list. Guard against leftover JSON fragments leaking through.
  if (text.startsWith("[{") || text.startsWith("{")) return [];
  return text.split(/[,\n]/).map((n) => n.trim()).filter((n) => n !== "");
}

/** K4: collapse the free-text level column to one canonical label per level. */
export function normaliseLevel(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (v === "") return NONE;
  const l = v.toLowerCase();
  if (/^(ug\b|under ?grad|bachelor)/.test(l)) return "Undergraduate";
  if (/^(pg\b|post ?grad|master)/.test(l)) return "Postgraduate";
  if (/^dip/.test(l)) return "Diploma";
  if (/^cert/.test(l)) return "Certificate";
  if (/^(phd|doctor)/.test(l)) return "Doctorate";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function plural(n: number, unit: string): string {
  const num = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${num} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * K5: legacy rows store the unit in `duration` and the magnitude in
 * `total_duration`, but the data is inconsistent ("2" with no unit, "2 Semester",
 * "6months"). Parse a number + unit from either field and render a consistent
 * "N Year(s) / Month(s) / Semester(s)". A bare number is treated as years; whole
 * multiples of 12 months collapse to years. (Mis-labelled semester rows that should
 * read years are a DB data fix, tracked separately.)
 */
export function formatDuration(unit: string | null | undefined, magnitude: string | null | undefined): string {
  const combined = `${(magnitude ?? "").trim()} ${(unit ?? "").trim()}`.trim();
  if (combined === "") return NONE;
  const m = combined.match(/(\d+(?:\.\d+)?)\s*(years?|yrs?|sem(?:ester)?s?|months?|mos?)/i);
  if (m) {
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u.startsWith("year") || u.startsWith("yr")) return plural(n, "Year");
    if (u.startsWith("sem")) return plural(n, "Semester");
    if (u.startsWith("month") || u.startsWith("mo")) {
      return n % 12 === 0 && n >= 12 ? plural(n / 12, "Year") : plural(n, "Month");
    }
  }
  const bare = combined.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return plural(parseFloat(bare[1]), "Year");
  return combined;
}

const clean = (v: string | null | undefined) => (v != null && v.trim() !== "" ? v.trim() : NONE);

export function mapCourse(r: ApiCourseRow): CourseView {
  const id = Number(r.id);
  const specs = parseSpecialisationNames(r.specialisations);
  const status = r.status == null || String(r.status).trim() === "" ? null : Number(r.status);
  const eligibility = htmlToText(r.eligibility_criteria);
  return {
    id,
    code: `CRS-${String(r.id).padStart(4, "0")}`,
    name: (r.title ?? "").trim() || (r.short_name ?? "").trim() || `Course #${id}`,
    group: clean(r.short_name),
    level: normaliseLevel(r.level),
    duration: formatDuration(r.duration, r.total_duration),
    mode: clean(r.study_mode),
    eligibility: eligibility || NONE,
    specialisations: specs,
    university: clean(r.university_name),
    universities: Number(r.mapped_universities_count ?? 0),
    fee: feeOf(r.total_amount),
    active: status !== 0,
  };
}

/** K6: coerce course.total_amount to a positive number, else null (no fee to show). */
function feeOf(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Duration in months for sorting ("2 Years" -> 24, "3 Semesters" -> 18); 0 when unparseable. */
export function monthsOf(duration: string): number {
  const m = duration.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (/year/i.test(duration)) return n * 12;
  if (/sem/i.test(duration)) return n * 6;
  if (/month/i.test(duration)) return n;
  return n * 12; // a bare number is treated as years
}

export const MODE_STYLES: Record<string, string> = {
  online: "bg-info-soft text-info border-transparent",
  offline: "bg-muted text-muted-foreground border-transparent",
  hybrid: "bg-primary-soft text-primary-soft-foreground border-transparent",
};

export function modeStyle(mode: string): string {
  return MODE_STYLES[mode.toLowerCase()] ?? "bg-muted text-muted-foreground border-transparent";
}
