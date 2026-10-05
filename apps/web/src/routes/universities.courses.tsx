import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api";
import {
  Download,
  Plus,
  Search,
  Pencil,
  Eye,
  X,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/universities/courses")({
  head: () => ({ meta: [{ title: "Courses — upCarrera" }] }),
  component: CoursesPage,
});

type Level = "Certification" | "Diploma" | "UG" | "PG" | "Doctorate";
/** What a status can be SET to. */
type Status = "Active" | "Inactive";
/**
 * What a course's status can READ as. `course.status` is a nullable Int with
 * no DB default and the legacy writer never populated it, so NULL is common —
 * and NULL is "never set", not "Inactive". It renders as its own state rather
 * than being silently folded into either real value.
 */
type CourseStatus = Status | "Not set";

// `id` is the DB primary key — every write (PATCH /courses/:id etc.) is
// addressed by it. `code` is a DISPLAY-ONLY label derived from that id; it is
// never minted client-side and never sent to the API.
type Course = {
  id: number;
  code: string;
  /** course.title, or a composed fallback when the title is blank. */
  name: string;
  /** course.short_name — the course group label. */
  group: string;
  /** Names parsed out of course.specialisations (JSON blob or plain text). */
  specialisation: string;
  /** Canonical level when the free-text column maps onto one, else null. */
  levelKey: Level | null;
  /** What the Level cell prints: the canonical level, the stored text, or "—". */
  levelLabel: string;
  /** total_duration (magnitude) + duration (unit), as stored. */
  duration: string;
  /** course.university_id is a single FK — the one university, or "—". */
  university: string;
  studyMode: string;
  status: CourseStatus;
  // --- RAW server values ---------------------------------------------------
  // Everything above is COERCED for rendering and filtering (placeholders such
  // as "—", a canonical level, parsed specialisation names). Those must never
  // reach a write, so Edit seeds from these raw values instead and the PATCH
  // body is diffed against them.
  rawTitle: string | null;
  rawShortName: string | null;
  rawLevel: string | null;
  rawDuration: string | null;
  rawTotalDuration: string | null;
  rawSpecialisations: string | null;
  rawStudyMode: string | null;
  rawEligibility: string | null;
  rawStatus: number | null;
};

// NOTE: no `level` and no `status`. `model group_courses` in prisma/schema.prisma
// has neither column, and CreateGroupCourseDto / UpdateGroupCourseDto accept only
// group_name / description / course_ids. Rendering (or collecting) either would
// be fabricated data that silently vanishes on save.
type Group = {
  id: number;
  code: string;
  name: string;
  description: string;
  totalCourses: number;
  /**
   * Ids the server could RESOLVE: AcademicsService.coursesForGroup queries
   * `course` with `deleted_at: null` and then "drop[s] ids that no longer
   * resolve". This is therefore a FILTERED PROJECTION of the stored column —
   * it is what the picker can show, and nothing more.
   */
  courseIds: number[];
  // --- RAW server values ---------------------------------------------------
  // Edit seeds from these, never from the "—" placeholder.
  rawGroupName: string | null;
  rawDescription: string | null;
  /**
   * The `course_ids` JSON column exactly as stored, parsed to numbers. Ids in
   * here but not in `courseIds` point at SOFT-DELETED courses: invisible in
   * the picker, so writing the picker's selection verbatim would erase them
   * for good. Every course_ids write merges them back in (see mergeCourseIds).
   */
  rawCourseIds: number[];
};

// NOTE: no `status` — `model specialisations` has no status column either.
type Specialisation = {
  id: number;
  code: string;
  name: string;
  description: string;
  /** Live count from the API (`courses_count`); null when the API omits it. */
  mappedCourses: number | null;
  // Raw server values — Edit seeds from these, never from the "—" placeholder.
  rawTitle: string | null;
  rawDescription: string | null;
};

// --- Live API wiring -------------------------------------------------------
// Every tab reads its paginated list ({ items, total, page, limit }) straight
// from the API and every dialog writes through a mutation that invalidates that
// list. There is no local overlay array: the invalidated query is the single
// source of truth, so a row only appears once the server has confirmed it.
// Fields the API does not carry render as "—" or 0 (never fabricated).
interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Raw /courses row (Prisma `course`): see academics.service.ts listCourses,
// which also decorates each row with the `university_name` of its single FK.
interface ApiCourseRow {
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
  status: number | string | null;
}

// GET /courses/:id — the row plus read-only context (AcademicsService.getCourseDetail).
interface ApiCourseDetail extends ApiCourseRow {
  is_lms_course?: number | null;
  semesters_count?: number | null;
}

// Raw /group-courses row decorated with its resolved `courses` array
// (AcademicsService.decorateGroupCourse).
interface ApiGroupRow {
  id: number | string;
  group_name: string | null;
  description: string | null;
  /** The raw JSON LongText column, e.g. "[3,17,42]" — the real stored value. */
  course_ids?: string | null;
  /** Decorated, and deliberately filtered to courses with deleted_at = null. */
  courses?: { id: number | string }[] | null;
  /** Live count of distinct referenced courses that still exist. */
  courses_count?: number | null;
}

// Raw /specialisations row (Prisma `specialisations`).
interface ApiSpecRow {
  id: number | string;
  title: string | null;
  description: string | null;
  course_id: number | string | null;
  /**
   * Live count of courses that use this specialisation — by its course_id FK
   * or by name inside course.specialisations (AcademicsService).
   */
  courses_count?: number | null;
}

// POST/PATCH /courses -> Create/UpdateCourseDto. Only columns that exist on
// `model course` are sent.
//
// Duration is TWO columns, following the legacy convention the LMS reads:
// `total_duration` holds the magnitude ("2") and `duration` the unit ("Year").
// CreateCourseDto requires level, specialisations, total_duration and duration.
interface CoursePayload {
  title?: string;
  short_name?: string;
  level?: string;
  duration?: string;
  total_duration?: string;
  specialisations?: string;
  eligibility_criteria?: string;
  study_mode?: string;
  status?: number;
}

// POST/PATCH /group-courses -> Create/UpdateGroupCourseDto. `course_ids` is
// required and must be non-empty (@ArrayNotEmpty).
interface GroupPayload {
  group_name: string;
  description?: string;
  course_ids: number[];
}

// PATCH /group-courses/:id -> UpdateGroupCourseDto. Every field is optional
// there, so the edit dialog sends only the fields the operator actually
// changed; `course_ids` must still be non-empty when it IS sent.
interface GroupUpdatePayload {
  group_name?: string;
  description?: string;
  course_ids?: number[];
}

// POST/PATCH /specialisations -> Create/UpdateSpecialisationDto.
interface SpecPayload {
  title?: string;
  description?: string;
}

// Rows per page for the three tables. The API list endpoints take ?page&?limit
// (ListQueryDto / CourseListQueryDto) and return a real `total`, so paging is
// server-side.
const PAGE_SIZE = 10;
// Dropdown sources must cover the whole catalog, not just the visible page, so
// the option queries are fetched once with a high limit and cached.
const OPTIONS_LIMIT = 1000;

const LEVEL_KEYS: Level[] = ["Certification", "Diploma", "UG", "PG", "Doctorate"];

/**
 * Map the free-text `course.level` column onto a canonical Level, or null.
 *
 * Stored values are things like "Post Graduate", "Masters", "PG Diploma",
 * "Under Graduate". Matching runs most-specific first and mirrors the sibling
 * University-detail screen (pg/post/master -> PG). Anything unrecognised is
 * NOT coerced: the old fallback turned every unknown level — MBA and MCA
 * included — into "Certification". The caller prints the stored text instead.
 */
function matchLevel(value: string | null | undefined): Level | null {
  const l = (value ?? "").trim().toLowerCase();
  if (l === "") return null;
  const exact = LEVEL_KEYS.find((k) => k.toLowerCase() === l);
  if (exact) return exact;
  if (/ph\.?\s?d|doctor|d\.?\s?phil/.test(l)) return "Doctorate";
  if (/\bpg\b|post|master/.test(l)) return "PG";
  if (l.includes("diploma")) return "Diploma";
  if (/\bug\b|under|bachelor|graduat/.test(l)) return "UG";
  if (l.includes("cert")) return "Certification";
  return null;
}

/** 1 -> Active, 0 (or any other number) -> Inactive, NULL -> Not set. */
function toCourseStatus(value: number | null): CourseStatus {
  if (value == null) return "Not set";
  return value === 1 ? "Active" : "Inactive";
}

/**
 * Names held in the free-form `course.specialisations` Text column. Mirrors
 * parseSpecialisationNames in academics.service.ts: the legacy admin wrote a
 * JSON array of `{ id, name, ... }` objects, others a JSON array of strings,
 * the CRM a plain (possibly comma-separated) string. The raw blob is never
 * rendered.
 */
function parseSpecialisationNames(raw: string | null | undefined): string[] {
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
      // not JSON after all — fall through to the plain-string reading
    }
  }
  return text
    .split(/[,\n]/)
    .map((n) => n.trim())
    .filter((n) => n !== "");
}

/** Display form of a specialisation column: parsed names, or "—". */
function specialisationLabel(raw: string | null | undefined): string {
  const names = parseSpecialisationNames(raw);
  return names.length > 0 ? names.join(", ") : "—";
}

/**
 * Duration as stored. Legacy rows keep the magnitude in `total_duration` and
 * the unit in `duration` ("2" + "Year"); reading only `duration` is what made
 * the column print a bare "Year". A `duration` that already starts with a
 * number ("2 Years", an older CRM write) is shown as-is.
 */
function formatDuration(
  unit: string | null | undefined,
  magnitude: string | null | undefined,
): string {
  const u = (unit ?? "").trim();
  const m = (magnitude ?? "").trim();
  if (u === "" && m === "") return "—";
  if (m === "") return u;
  if (u === "" || /^\d/.test(u)) return u || m;
  return `${m} ${u}`;
}

/**
 * A course title composed from its group and specialisation. "General" is
 * the "no specific specialisation" value, so "MBA" rather than "MBA in General".
 */
function composeCourseTitle(group: string, spec: string): string {
  const g = group.trim();
  const s = spec.trim();
  if (s === "" || s.toLowerCase() === "general") return g || s;
  return g ? `${g} in ${s}` : s;
}

function blankToDash(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : "—";
}

// "—" is the placeholder blankToDash renders for a NULL column. It is a
// DISPLAY artefact: no edit form may ever seed from it (that is what the raw
// fields below exist for), so there is no longer a "strip the dash" helper.

// The UNcoerced column value, kept verbatim alongside the display value.
// NULL stays NULL; "" stays "". Both seed an Edit field as "", so an untouched
// field diffs clean either way.
function rawText(value: string | null | undefined): string | null {
  return value == null ? null : String(value);
}

// `course.status` is a nullable int column. NULL is NOT "Inactive" — it is
// "never set", and must stay that way unless the operator picks a value.
function rawStatus(value: number | string | null | undefined): number | null {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapApiCourse(r: ApiCourseRow): Course {
  const id = Number(r.id);
  const shortName = (r.short_name ?? "").trim();
  const specNames = parseSpecialisationNames(r.specialisations);
  // The real title wins. Composition is only a fallback for a blank title,
  // and never produces "MBA in —" — a missing part is simply left out.
  const name =
    (r.title ?? "").trim() ||
    composeCourseTitle(shortName, specNames[0] ?? "") ||
    `Course #${id}`;
  const levelKey = matchLevel(r.level);
  const status = rawStatus(r.status);
  return {
    id,
    code: `CRS-${String(r.id).padStart(4, "0")}`,
    name,
    group: shortName || "—",
    specialisation: specNames.length > 0 ? specNames.join(", ") : "—",
    levelKey,
    levelLabel: levelKey ?? ((r.level ?? "").trim() || "—"),
    duration: formatDuration(r.duration, r.total_duration),
    university:
      (r.university_name ?? "").trim() ||
      (r.university_id != null && String(r.university_id).trim() !== ""
        ? `University #${r.university_id}`
        : "—"),
    studyMode: (r.study_mode ?? "").trim() || "—",
    status: toCourseStatus(status),
    // Raw columns, one-to-one with what the PATCH writes. Every value above is
    // for DISPLAY only.
    rawTitle: rawText(r.title),
    rawShortName: rawText(r.short_name),
    rawLevel: rawText(r.level),
    rawDuration: rawText(r.duration),
    rawTotalDuration: rawText(r.total_duration),
    rawSpecialisations: rawText(r.specialisations),
    rawStudyMode: rawText(r.study_mode),
    rawEligibility: rawText(r.eligibility_criteria),
    rawStatus: status,
  };
}

// Mirror of AcademicsService.parseCourseIds — the stored column is a JSON
// LongText, parsed leniently so a malformed value degrades to "no raw ids"
// rather than throwing mid-render.
function parseCourseIds(value: string | null | undefined): number[] {
  if (value == null || String(value).trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => Number(v)).filter((n) => Number.isInteger(n));
  } catch {
    return [];
  }
}

function mapApiGroup(r: ApiGroupRow): Group {
  // RESOLVED ids — already filtered server-side to courses with deleted_at=null.
  const courseIds = Array.isArray(r.courses)
    ? r.courses.map((c) => Number(c.id)).filter((n) => Number.isFinite(n))
    : [];
  // RAW ids — the column verbatim. Falls back to the resolved projection only
  // when the API did not send the column at all, which is the best that can be
  // known in that case (and never loses more than today's behaviour).
  const parsedRaw = parseCourseIds(r.course_ids);
  const rawCourseIds = r.course_ids === undefined ? courseIds : parsedRaw;
  return {
    id: Number(r.id),
    code: `GRP-${String(r.id).padStart(3, "0")}`,
    name: blankToDash(r.group_name),
    description: r.description != null ? String(r.description) : "",
    // The count the table shows is the number of courses that still exist —
    // the API's live `courses_count`, or the resolved list when it is absent.
    totalCourses:
      r.courses_count != null && Number.isFinite(Number(r.courses_count))
        ? Number(r.courses_count)
        : new Set(courseIds).size,
    courseIds,
    rawGroupName: rawText(r.group_name),
    rawDescription: rawText(r.description),
    rawCourseIds,
  };
}

function mapApiSpec(r: ApiSpecRow): Specialisation {
  return {
    id: Number(r.id),
    code: `SPC-${String(r.id).padStart(3, "0")}`,
    name: blankToDash(r.title),
    description: r.description != null ? String(r.description) : "",
    // Live count from the API (course_id FK + courses naming it). Never
    // fabricated: when the API does not send it, the cell shows "—".
    mappedCourses:
      r.courses_count != null && Number.isFinite(Number(r.courses_count))
        ? Number(r.courses_count)
        : null,
    rawTitle: rawText(r.title),
    rawDescription: rawText(r.description),
  };
}

const LEVELS: Level[] = ["Certification", "Diploma", "UG", "PG", "Doctorate"];

const LEVEL_STYLE: Record<Level, string> = {
  Certification: "bg-amber-50 text-amber-700 ring-amber-200",
  Diploma: "bg-sky-50 text-sky-700 ring-sky-200",
  UG: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PG: "bg-violet-50 text-violet-700 ring-violet-200",
  Doctorate: "bg-rose-50 text-rose-700 ring-rose-200",
};

/**
 * Duration units, in the legacy vocabulary stored in `course.duration` (the
 * QA export shows "Year" / "Semester"). A stored value outside this list is
 * surfaced verbatim by selectOptions.
 */
const DURATION_UNITS = ["Year", "Semester", "Month"];

/** `course.study_mode` values (VarChar(25)); stored outliers are surfaced. */
const STUDY_MODES = ["Online", "ODL", "Distance", "Regular"];

/** The "no specific specialisation" value CreateCourseDto accepts. */
const GENERAL_SPECIALISATION = "General";

/** A positive duration magnitude — mirrors DURATION_MAGNITUDE in CreateCourseDto. */
const DURATION_MAGNITUDE = /^(?=.*[1-9])\d+(?:\.\d+)?$/;

/**
 * Options for a Select that is seeded from a free-text column.
 *
 * `course.level`, `course.short_name` and `course.specialisations` are free
 * text, while the dropdowns are built from LEVELS / group_courses.group_name /
 * specialisations.title. When the stored value matches no option, Radix renders
 * an EMPTY trigger while the state still holds the value — the operator cannot
 * see what is stored and a blur-free "Save" ships it back unchanged at best.
 * Surfacing the stored value as an extra option makes it visible instead.
 */
function selectOptions(values: readonly string[], stored: string): string[] {
  const unique = Array.from(
    new Set(values.map((v) => v.trim()).filter((v) => v !== "" && v !== "—")),
  );
  if (stored === "") return unique;
  if (unique.includes(stored)) return unique;
  // Surfaced VERBATIM, not trimmed. Radix matches SelectItem `value` against
  // the Select's `value` by strict equality, and the Select's value is the
  // untrimmed seed (seedCourseForm does not trim). Prepending a trimmed copy
  // of a stored " PG " would leave the trigger blank over non-empty state —
  // exactly the failure this helper exists to prevent — and would nudge the
  // operator into a pick they did not mean to make.
  return [stored, ...unique];
}

/**
 * The ONE specialisation name a stored/picked `specialisations` value stands
 * for, for title composition. "" for a blank column; null when the value is
 * not a single name (a JSON blob that parses to 0 or 2+ names, or a
 * comma-list). The raw value itself is NEVER composed into a title — on the
 * legacy rows it is a JSON blob like `[{"id":"…","name":"Marketing"}]`.
 */
function singleSpecName(raw: string): string | null {
  if (raw.trim() === "") return "";
  const names = parseSpecialisationNames(raw);
  return names.length === 1 ? names[0] : null;
}

/** Case/space-insensitive title comparison for the "auto-generated" test. */
function sameTitle(a: string, b: string): boolean {
  const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * The title a course would be STORED with after this edit, or null for
 * "leave `course.title` alone".
 *
 * `title` is DERIVED from short_name + specialisations, and a derived field is
 * still a write. Rules:
 *   1. Derive only when a component actually changed — a level-only edit must
 *      never rewrite a hand-authored title.
 *   2. Derive only from a genuine group and a single PARSED specialisation
 *      name. A blank component, a multi-name value, or an unparseable value
 *      means "do not derive". An unchanged specialisation that is a legacy
 *      JSON blob also means "do not derive" — the row is left as authored.
 *   3. Derive only over a title that is blank or was itself auto-generated,
 *      i.e. equals what the SEED values compose to (the same rule
 *      EditIntakeDialog applies via nameIsAutoGenerated). A hand-written
 *      "Master of Business Administration" is never replaced by a bare "MBA".
 *
 * The submit path and the read-only Course Name preview both read this one
 * function, so the preview can never show something different from what the
 * PATCH carries.
 */
function derivedCourseTitle(
  seed: CourseFormState,
  form: CourseFormState,
  storedTitle: string | null,
): string | null {
  const specChanged = form.spec !== seed.spec;
  if (form.group === seed.group && !specChanged) return null;

  const g = form.group.trim();
  const s = singleSpecName(form.spec);
  if (g === "" || s === null || s === "") return null;
  // Unchanged spec that is not stored as a plain single name (a JSON blob):
  // leave the title alone rather than re-derive from a legacy encoding.
  if (!specChanged && form.spec.trim() !== s) return null;

  const stored = storedTitle ?? "";
  if (stored.trim() !== "") {
    const seedSpec = singleSpecName(seed.spec);
    if (seedSpec === null) return null;
    const seedTitle = composeCourseTitle(seed.group, seedSpec);
    if (seedTitle === "" || !sameTitle(stored, seedTitle)) return null;
  }
  return composeCourseTitle(g, s);
}

/** Edit-form state for a course, seeded ONLY from raw column values. */
type CourseFormState = {
  level: string;
  group: string;
  spec: string;
  /** Edits `total_duration` (the magnitude). */
  durationNum: string;
  /** Edits `duration` (the unit). */
  durationUnit: string;
  /**
   * True when the row stores a composite "2 Years" in `duration` with a blank
   * `total_duration` (an older CRM write). The form splits it for editing and,
   * only if the operator changes it, writes it back split the legacy way.
   */
  durationComposite: boolean;
  studyMode: string;
  eligibility: string;
  /** "" means the column is NULL — distinct from an explicit Inactive (0). */
  status: Status | "";
};

const EMPTY_COURSE_FORM: CourseFormState = {
  level: "",
  group: "",
  spec: "",
  durationNum: "",
  durationUnit: "",
  durationComposite: false,
  studyMode: "",
  eligibility: "",
  status: "",
};

function seedCourseForm(course: Course): CourseFormState {
  const unit = course.rawDuration ?? "";
  const magnitude = course.rawTotalDuration ?? "";
  const composite =
    magnitude.trim() === "" ? unit.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/) : null;
  return {
    level: course.rawLevel ?? "",
    group: course.rawShortName ?? "",
    spec: course.rawSpecialisations ?? "",
    durationNum: composite ? composite[1] : magnitude,
    durationUnit: composite ? composite[2].trim() : unit,
    durationComposite: composite != null,
    studyMode: course.rawStudyMode ?? "",
    eligibility: course.rawEligibility ?? "",
    status: course.rawStatus == null ? "" : course.rawStatus === 1 ? "Active" : "Inactive",
  };
}

/** Specialisation options: every master name, plus "General" for "none". */
function specialisationOptions(specs: Specialisation[]): string[] {
  const names = specs.map((s) => s.name);
  return names.some((n) => n.trim().toLowerCase() === "general")
    ? names
    : [GENERAL_SPECIALISATION, ...names];
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((v, i) => v === right[i]);
}

/**
 * Merge the picker's selection back into the group's RAW `course_ids` column.
 *
 * The picker can only ever render ids the server RESOLVED, and it resolves
 * against `deleted_at: null` — ids pointing at soft-deleted courses are
 * dropped before the row reaches the browser. Writing the picker's selection
 * verbatim would therefore erase every one of those ids permanently, from an
 * edit the operator believes only ticked one extra box.
 *
 * So: walk the stored ids in their stored order, keep an id that the operator
 * could see only if it is still ticked, and keep an id they could NOT see
 * unconditionally. Then append the ids they newly ticked.
 */
function mergeCourseIds(
  rawIds: readonly number[],
  resolvedIds: readonly number[],
  selected: readonly number[],
): number[] {
  const visible = new Set(resolvedIds);
  const chosen = new Set(selected);
  const kept = rawIds.filter((id) => (visible.has(id) ? chosen.has(id) : true));
  const keptSet = new Set(kept);
  const added = selected.filter((id) => !keptSet.has(id) && !rawIds.includes(id));
  return [...kept, ...added];
}

function StatusBadge({ status }: { status: CourseStatus }) {
  if (status === "Not set") {
    return (
      <Badge
        variant="outline"
        className="border-dashed text-muted-foreground"
        title="No status has been saved for this course"
      >
        Not set
      </Badge>
    );
  }
  return status === "Active" ? (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-zinc-100 text-zinc-600">
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-zinc-400" />
      Inactive
    </Badge>
  );
}

/** Server-side pager shared by the three tabs. */
function TablePager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (next: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <div>
        Showing{" "}
        <span className="font-semibold text-foreground">
          {total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
        </span>{" "}
        –{" "}
        <span className="font-semibold text-foreground">
          {Math.min(currentPage * PAGE_SIZE, total)}
        </span>{" "}
        of <span className="font-semibold text-foreground">{total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <span className="px-2 font-medium text-foreground">
          Page {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Scrollable checkbox list used by the Add / Edit Group course picker. */
function CoursePicker({
  courses,
  selected,
  onToggle,
  loading,
}: {
  courses: Course[];
  selected: number[];
  onToggle: (id: number) => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
        <span>Select at least one course</span>
        <span className="font-medium text-foreground">{selected.length} selected</span>
      </div>
      <div className="max-h-44 overflow-y-auto p-1">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading courses…
          </div>
        ) : courses.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground">No courses available.</div>
        ) : (
          courses.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              <Checkbox
                checked={selected.includes(c.id)}
                onCheckedChange={() => onToggle(c.id)}
              />
              <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
              <span className="truncate">{c.name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function CoursesPage() {
  const qc = useQueryClient();

  // One page per tab, driven by the API's ?page&?limit.
  const [coursePage, setCoursePage] = useState(1);
  const [groupPage, setGroupPage] = useState(1);
  const [specPage, setSpecPage] = useState(1);

  const coursesQuery = useQuery({
    queryKey: ["courses", "list", { page: coursePage, limit: PAGE_SIZE }],
    queryFn: () => apiGet<Paginated<ApiCourseRow>>("/courses", { page: coursePage, limit: PAGE_SIZE }),
  });
  const groupsQuery = useQuery({
    queryKey: ["group-courses", "list", { page: groupPage, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<Paginated<ApiGroupRow>>("/group-courses", { page: groupPage, limit: PAGE_SIZE }),
  });
  const specsQuery = useQuery({
    queryKey: ["specialisations", "list", { page: specPage, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<Paginated<ApiSpecRow>>("/specialisations", { page: specPage, limit: PAGE_SIZE }),
  });

  // Dropdown / picker sources — the whole catalog, independent of the visible
  // page, so a filter never offers a value that cannot be selected.
  const courseOptionsQuery = useQuery({
    queryKey: ["courses", "options"],
    queryFn: () => apiGet<Paginated<ApiCourseRow>>("/courses", { page: 1, limit: OPTIONS_LIMIT }),
    staleTime: 5 * 60 * 1000,
  });
  const groupOptionsQuery = useQuery({
    queryKey: ["group-courses", "options"],
    queryFn: () =>
      apiGet<Paginated<ApiGroupRow>>("/group-courses", { page: 1, limit: OPTIONS_LIMIT }),
    staleTime: 5 * 60 * 1000,
  });
  const specOptionsQuery = useQuery({
    queryKey: ["specialisations", "options"],
    queryFn: () =>
      apiGet<Paginated<ApiSpecRow>>("/specialisations", { page: 1, limit: OPTIONS_LIMIT }),
    staleTime: 5 * 60 * 1000,
  });

  // Rendered straight from the query data — no local overlay arrays.
  const courses = useMemo<Course[]>(
    () => (coursesQuery.data?.items ?? []).map(mapApiCourse),
    [coursesQuery.data],
  );
  const groups = useMemo<Group[]>(
    () => (groupsQuery.data?.items ?? []).map(mapApiGroup),
    [groupsQuery.data],
  );
  const specs = useMemo<Specialisation[]>(
    () => (specsQuery.data?.items ?? []).map(mapApiSpec),
    [specsQuery.data],
  );

  const courseOptions = useMemo<Course[]>(
    () => (courseOptionsQuery.data?.items ?? []).map(mapApiCourse),
    [courseOptionsQuery.data],
  );
  const groupOptions = useMemo<Group[]>(
    () => (groupOptionsQuery.data?.items ?? []).map(mapApiGroup),
    [groupOptionsQuery.data],
  );
  const specOptions = useMemo<Specialisation[]>(
    () => (specOptionsQuery.data?.items ?? []).map(mapApiSpec),
    [specOptionsQuery.data],
  );

  const [tab, setTab] = useState("courses");
  const [query, setQuery] = useState("");

  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addSpecOpen, setAddSpecOpen] = useState(false);

  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [viewCourse, setViewCourse] = useState<Course | null>(null);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [editSpec, setEditSpec] = useState<Specialisation | null>(null);

  // --- Write flows ---------------------------------------------------------
  // Every dialog POSTs/PATCHes first, then invalidates the matching list query
  // and only then toasts + closes. Nothing is appended locally, so a row that
  // shows up in the table came back from the server.
  const apiMessage = (e: unknown) =>
    e instanceof ApiError ? e.message : "Something went wrong";

  // Specialisation and group `courses_count` are computed from course rows,
  // and the application form's pickers read the "catalog" caches — a course
  // write makes all of them stale, not just ["courses"].
  const invalidateCourseDependents = () => {
    qc.invalidateQueries({ queryKey: ["courses"] });
    qc.invalidateQueries({ queryKey: ["specialisations"] });
    qc.invalidateQueries({ queryKey: ["group-courses"] });
    qc.invalidateQueries({ queryKey: ["catalog", "courses"] });
  };
  const invalidateSpecialisations = () => {
    qc.invalidateQueries({ queryKey: ["specialisations"] });
    qc.invalidateQueries({ queryKey: ["catalog", "specialisations"] });
  };

  const createCourseMut = useMutation({
    mutationFn: (body: CoursePayload) => apiPost("/courses", body),
    onSuccess: () => {
      invalidateCourseDependents();
      toast.success("Course created");
      setCreateCourseOpen(false);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const updateCourseMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: CoursePayload }) =>
      apiPatch(`/courses/${id}`, body),
    onSuccess: () => {
      invalidateCourseDependents();
      toast.success("Course updated");
      setEditCourse(null);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  // PATCH /courses/:id/status (UpdateCourseStatusDto { status: int }).
  const courseStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: number }) =>
      apiPatch(`/courses/${id}/status`, { status }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast.success(variables.status === 1 ? "Course activated" : "Course deactivated");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const createGroupMut = useMutation({
    mutationFn: (body: GroupPayload) => apiPost("/group-courses", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-courses"] });
      toast.success("Group added");
      setAddGroupOpen(false);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const updateGroupMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: GroupUpdatePayload }) =>
      apiPatch(`/group-courses/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-courses"] });
      toast.success("Group updated");
      setEditGroup(null);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const createSpecMut = useMutation({
    mutationFn: (body: SpecPayload) => apiPost("/specialisations", body),
    onSuccess: () => {
      invalidateSpecialisations();
      toast.success("Specialisation added");
      setAddSpecOpen(false);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const updateSpecMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: SpecPayload }) =>
      apiPatch(`/specialisations/${id}`, body),
    onSuccess: () => {
      invalidateSpecialisations();
      toast.success("Specialisation updated");
      setEditSpec(null);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  // The list endpoints expose no ?search param (ListQueryDto / CourseListQueryDto
  // carry page/limit only), so the search box refines the FETCHED PAGE rather
  // than querying the server. Labelled as such in the UI.
  const filteredCourses = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.group.toLowerCase().includes(q) ||
        c.specialisation.toLowerCase().includes(q) ||
        c.university.toLowerCase().includes(q),
    );
  }, [courses, query]);

  const filteredGroups = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) => g.code.toLowerCase().includes(q) || g.name.toLowerCase().includes(q),
    );
  }, [groups, query]);

  const filteredSpecs = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return specs;
    return specs.filter(
      (s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [specs, query]);

  // No export endpoint exists for the catalog. Say so rather than claim a
  // file is on its way.
  const handleExport = () =>
    toast.error("Export is not available yet — no file was generated.");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create reusable course templates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setAddSpecOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Specialisation
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setAddGroupOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Group
          </Button>
          <Button
            onClick={() => setCreateCourseOpen(true)}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Create Course
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="groups">Course Group</TabsTrigger>
          <TabsTrigger value="specs">Specialisations</TabsTrigger>
        </TabsList>

        {/* Search */}
        <div className="mt-4 rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b p-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="pl-9"
              />
            </div>
            {query && (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              Search refines the current page
            </span>
          </div>

          <TabsContent value="courses" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4 w-16">Sl No</TableHead>
                    <TableHead>Course Code</TableHead>
                    <TableHead>Course Name</TableHead>
                    <TableHead>Course Level</TableHead>
                    <TableHead>Course Group</TableHead>
                    <TableHead>Specialisation</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>University</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coursesQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading courses…
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : coursesQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500/70" />
                          {coursesQuery.error instanceof Error
                            ? coursesQuery.error.message
                            : "Couldn’t load courses."}
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : filteredCourses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                        No courses found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCourses.map((c, i) => (
                      <TableRow key={c.id} className="hover:bg-muted/40">
                        <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                          {(coursePage - 1) * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setViewCourse(c)}
                            className="font-mono text-xs font-medium text-primary hover:underline"
                            title="View course"
                          >
                            {c.code}
                          </button>
                        </TableCell>
                        <TableCell className="py-3 text-sm font-medium text-foreground">
                          {c.name}
                        </TableCell>
                        <TableCell className="py-3">
                          <LevelBadge course={c} />
                        </TableCell>
                        <TableCell className="py-3 text-sm">{c.group}</TableCell>
                        <TableCell className="max-w-[16rem] py-3 text-sm">
                          <span className="line-clamp-2" title={c.specialisation}>
                            {c.specialisation}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-sm">{c.duration}</TableCell>
                        <TableCell className="py-3 text-sm">{c.university}</TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={c.status === "Active"}
                              disabled={courseStatusMut.isPending}
                              onCheckedChange={(next) =>
                                courseStatusMut.mutate({ id: c.id, status: next ? 1 : 0 })
                              }
                              aria-label="Toggle status"
                            />
                            <StatusBadge status={c.status} />
                          </div>
                        </TableCell>
                        <TableCell className="py-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View"
                              onClick={() => setViewCourse(c)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Edit"
                              onClick={() => setEditCourse(c)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <TablePager
              page={coursePage}
              total={coursesQuery.data?.total ?? 0}
              onPage={setCoursePage}
            />
          </TabsContent>

          <TabsContent value="groups" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4 w-16">Sl No</TableHead>
                    <TableHead>Group Code</TableHead>
                    <TableHead>Group Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Total Courses</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading groups…
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : groupsQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500/70" />
                          {groupsQuery.error instanceof Error
                            ? groupsQuery.error.message
                            : "Couldn’t load groups."}
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : filteredGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No groups found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredGroups.map((g, i) => (
                    <TableRow key={g.id} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                        {(groupPage - 1) * PAGE_SIZE + i + 1}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{g.code}</TableCell>
                      <TableCell className="py-3 text-sm font-medium">{g.name}</TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">{g.description}</TableCell>
                      <TableCell className="py-3 text-sm">{g.totalCourses}</TableCell>
                      <TableCell className="py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Edit"
                            onClick={() => setEditGroup(g)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <TablePager
              page={groupPage}
              total={groupsQuery.data?.total ?? 0}
              onPage={setGroupPage}
            />
          </TabsContent>

          <TabsContent value="specs" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4 w-16">Sl No</TableHead>
                    <TableHead>Specialisation Code</TableHead>
                    <TableHead>Specialisation Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Mapped Courses</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {specsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading specialisations…
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : specsQuery.isError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500/70" />
                          {specsQuery.error instanceof Error
                            ? specsQuery.error.message
                            : "Couldn’t load specialisations."}
                        </span>
                      </TableCell>
                    </TableRow>
                  ) : filteredSpecs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No specialisations found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSpecs.map((s, i) => (
                    <TableRow key={s.id} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                        {(specPage - 1) * PAGE_SIZE + i + 1}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.code}</TableCell>
                      <TableCell className="py-3 text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">{s.description}</TableCell>
                      <TableCell className="py-3 text-sm tabular-nums">
                        {s.mappedCourses ?? "—"}
                      </TableCell>
                      <TableCell className="py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Edit"
                            onClick={() => setEditSpec(s)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <TablePager
              page={specPage}
              total={specsQuery.data?.total ?? 0}
              onPage={setSpecPage}
            />
          </TabsContent>
        </div>
      </Tabs>

      <CreateCourseDialog
        open={createCourseOpen}
        onClose={() => setCreateCourseOpen(false)}
        groups={groupOptions}
        specs={specOptions}
        isPending={createCourseMut.isPending}
        onSubmit={(body) => createCourseMut.mutate(body)}
      />

      <AddGroupDialog
        open={addGroupOpen}
        onClose={() => setAddGroupOpen(false)}
        courses={courseOptions}
        coursesLoading={courseOptionsQuery.isLoading}
        isPending={createGroupMut.isPending}
        onSubmit={(body) => createGroupMut.mutate(body)}
      />

      <AddSpecDialog
        open={addSpecOpen}
        onClose={() => setAddSpecOpen(false)}
        isPending={createSpecMut.isPending}
        onSubmit={(body) => createSpecMut.mutate(body)}
      />

      <CourseDetailDialog
        course={viewCourse}
        onClose={() => setViewCourse(null)}
        onEdit={(c) => {
          setViewCourse(null);
          setEditCourse(c);
        }}
      />

      <EditCourseDialog
        course={editCourse}
        groups={groupOptions}
        specs={specOptions}
        onClose={() => setEditCourse(null)}
        isPending={updateCourseMut.isPending}
        onSubmit={(id, body) => updateCourseMut.mutate({ id, body })}
      />

      <EditGroupDialog
        group={editGroup}
        courses={courseOptions}
        coursesLoading={courseOptionsQuery.isLoading}
        onClose={() => setEditGroup(null)}
        isPending={updateGroupMut.isPending}
        onSubmit={(id, body) => updateGroupMut.mutate({ id, body })}
      />

      <EditSpecDialog
        spec={editSpec}
        onClose={() => setEditSpec(null)}
        isPending={updateSpecMut.isPending}
        onSubmit={(id, body) => updateSpecMut.mutate({ id, body })}
      />
    </div>
  );
}

/* ---------------- Level badge ---------------- */

function LevelBadge({ course }: { course: Course }) {
  if (course.levelKey) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${LEVEL_STYLE[course.levelKey]}`}
        title={course.rawLevel ?? undefined}
      >
        {course.levelKey}
      </span>
    );
  }
  if (course.levelLabel === "—") {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  // A stored level that maps onto no canonical one is shown as stored.
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
      {course.levelLabel}
    </span>
  );
}

/* ---------------- Create Course ---------------- */

function CreateCourseDialog({
  open,
  onClose,
  groups,
  specs,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  groups: Group[];
  specs: Specialisation[];
  isPending: boolean;
  onSubmit: (body: CoursePayload) => void;
}) {
  const [level, setLevel] = useState<Level | "">("");
  const [group, setGroup] = useState("");
  const [spec, setSpec] = useState("");
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState(DURATION_UNITS[0]);
  const [studyMode, setStudyMode] = useState("");
  const [eligibility, setEligibility] = useState("");
  const [status, setStatus] = useState<Status>("Active");

  // A fresh install has no group_courses rows, so the dropdown would be empty.
  // `short_name` is a free-text @IsOptional column server-side, so fall back to
  // a plain text field rather than blocking the form. Specialisation always
  // has at least "General" to pick.
  const groupFreeText = groups.length === 0;

  const courseName = composeCourseTitle(group, spec);

  // Clear the form whenever the dialog closes — including the close the parent
  // performs after a confirmed POST.
  useEffect(() => {
    if (open) return;
    setLevel("");
    setGroup("");
    setSpec("");
    setDuration("");
    setDurationUnit(DURATION_UNITS[0]);
    setStudyMode("");
    setEligibility("");
    setStatus("Active");
  }, [open]);

  const submit = () => {
    // Mirrors CreateCourseDto: level, specialisation (or "General") and a
    // duration magnitude + unit are required. Course Group stays optional
    // (`short_name` is @IsOptional).
    if (!level || !spec.trim() || !duration.trim() || !durationUnit) {
      toast.error("Please fill all required fields");
      return;
    }
    if (!DURATION_MAGNITUDE.test(duration.trim())) {
      toast.error("Duration must be a positive number, e.g. 2");
      return;
    }
    // The title is composed from group + specialisation, and "General" adds
    // nothing to it — with no group the course would be titled just "General".
    if (!group.trim() && spec.trim().toLowerCase() === "general") {
      toast.error("Choose a Course Group for a General course");
      return;
    }
    // Real `course` columns only. Duration is written the legacy way —
    // magnitude in total_duration, unit in duration — which is what the LMS
    // and the existing rows use. The course code is derived from the DB id
    // after insert, so nothing is minted client-side. Blank optional fields
    // are OMITTED, never sent as "".
    onSubmit({
      title: courseName,
      short_name: group.trim() || undefined,
      level,
      total_duration: duration.trim(),
      duration: durationUnit,
      specialisations: spec.trim(),
      study_mode: studyMode || undefined,
      eligibility_criteria: eligibility.trim() || undefined,
      status: status === "Active" ? 1 : 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Course</DialogTitle>
          <DialogDescription>Define a reusable course template.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Course Level *</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
              <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Course Group</Label>
            {groupFreeText ? (
              <>
                <Input
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="e.g. MBA"
                />
                <p className="text-xs text-muted-foreground">
                  No course groups exist yet — type one, or leave blank.
                </p>
              </>
            ) : (
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  {selectOptions(groups.map((g) => g.name), "").map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Specialisation *</Label>
            <Select value={spec} onValueChange={setSpec}>
              <SelectTrigger><SelectValue placeholder="Select specialisation" /></SelectTrigger>
              <SelectContent>
                {selectOptions(specialisationOptions(specs), "").map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pick “General” when the course has no specific specialisation.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Course Name (Auto)</Label>
            <Input value={courseName} readOnly placeholder="Auto-generated" className="bg-muted/40" />
          </div>

          <div className="space-y-1.5">
            <Label>Course Code (Auto)</Label>
            <Input
              value=""
              readOnly
              placeholder="Assigned on save"
              className="bg-muted/40 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Duration *</Label>
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="2"
              type="number"
              min={0}
              step="any"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Duration Unit *</Label>
            <Select value={durationUnit} onValueChange={setDurationUnit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Mode of Study</Label>
            <Select value={studyMode} onValueChange={setStudyMode}>
              <SelectTrigger><SelectValue placeholder="Select mode" /></SelectTrigger>
              <SelectContent>
                {STUDY_MODES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Eligibility</Label>
            <Textarea
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
              rows={3}
              placeholder="e.g. Graduation in any discipline with 50% marks"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {isPending ? "Saving…" : "Create Course"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Course detail (View) ---------------- */

function DetailField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Read-only course detail, fetched from GET /courses/:id so it reflects the
 * stored row (plus its university and semester count), not the list page's
 * possibly stale copy. The list row is only used for the header while loading.
 */
function CourseDetailDialog({
  course,
  onClose,
  onEdit,
}: {
  course: Course | null;
  onClose: () => void;
  onEdit: (course: Course) => void;
}) {
  const id = course?.id ?? null;
  const detailQuery = useQuery({
    queryKey: ["courses", "detail", id],
    queryFn: () => apiGet<ApiCourseDetail>(`/courses/${id}`),
    enabled: id != null,
  });

  const detail = detailQuery.data ?? null;
  const shown = detail ? mapApiCourse(detail) : course;
  const specNames = detail
    ? parseSpecialisationNames(detail.specialisations)
    : course
      ? parseSpecialisationNames(course.rawSpecialisations)
      : [];
  const eligibility = (detail?.eligibility_criteria ?? "").trim();
  const semesters = detail?.semesters_count;

  return (
    <Dialog open={!!course} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {shown?.name ?? "Course"}
            {shown && (
              <span className="font-mono text-xs font-normal text-muted-foreground">
                {shown.code}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>Course template details.</DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading course…
          </div>
        ) : detailQuery.isError ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-red-500/70" />
            {detailQuery.error instanceof Error
              ? detailQuery.error.message
              : "Couldn’t load this course."}
          </div>
        ) : shown ? (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailField label="Level">
              <LevelBadge course={shown} />
            </DetailField>
            <DetailField label="Status">
              <StatusBadge status={shown.status} />
            </DetailField>
            <DetailField label="Course Group">{shown.group}</DetailField>
            <DetailField label="Duration">{shown.duration}</DetailField>
            <DetailField label="Mode of Study">{shown.studyMode}</DetailField>
            <DetailField label="University">{shown.university}</DetailField>
            <DetailField label="Semesters">
              {semesters == null
                ? "—"
                : semesters === 0
                  ? "None defined"
                  : `${semesters} semester${semesters === 1 ? "" : "s"}`}
            </DetailField>
            <DetailField label="LMS Course">
              {detail?.is_lms_course == null ? "—" : detail.is_lms_course === 1 ? "Yes" : "No"}
            </DetailField>
            <DetailField label="Specialisations" wide>
              {specNames.length === 0 ? (
                "—"
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {specNames.map((n, i) => (
                    <Badge key={`${n}-${i}`} variant="secondary" className="font-normal">
                      {n}
                    </Badge>
                  ))}
                </div>
              )}
            </DetailField>
            <DetailField label="Eligibility" wide>
              {eligibility === "" ? (
                "—"
              ) : (
                <p className="whitespace-pre-wrap">{eligibility}</p>
              )}
            </DetailField>
          </dl>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            onClick={() => shown && onEdit(shown)}
            disabled={!shown || detailQuery.isLoading}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Add Group ---------------- */

function AddGroupDialog({
  open, onClose, courses, coursesLoading, isPending, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  courses: Course[];
  coursesLoading: boolean;
  isPending: boolean;
  onSubmit: (body: GroupPayload) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [courseIds, setCourseIds] = useState<number[]>([]);

  useEffect(() => {
    if (open) return;
    setName("");
    setDescription("");
    setCourseIds([]);
  }, [open]);

  const toggleCourseId = (id: number) =>
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    const trimmed = name.trim();
    // Mirrors CreateGroupCourseDto: group_name 3-255 chars, course_ids non-empty.
    if (trimmed.length < 3) {
      toast.error("Group name must be at least 3 characters");
      return;
    }
    if (courseIds.length === 0) {
      toast.error("Select at least one course");
      return;
    }
    onSubmit({
      group_name: trimmed,
      description: description.trim() || undefined,
      course_ids: courseIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Course Group</DialogTitle>
          <DialogDescription>Reusable group like MBA, BBA, BCA.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Group Code</Label>
            <Input value="" readOnly placeholder="Assigned on save" className="bg-muted/40 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Group Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MBA" />
          </div>
          <div className="space-y-1.5">
            <Label>Courses *</Label>
            <CoursePicker
              courses={courses}
              selected={courseIds}
              onToggle={toggleCourseId}
              loading={coursesLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {isPending ? "Saving…" : "Add Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Add Specialisation ---------------- */

function AddSpecDialog({
  open, onClose, isPending, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (body: SpecPayload) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) return;
    setName("");
    setDescription("");
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Name required"); return; }
    onSubmit({ title: trimmed, description: description.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Specialisation</DialogTitle>
          <DialogDescription>Reusable specialisation like Finance, HR, Marketing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input value="" readOnly placeholder="Assigned on save" className="bg-muted/40 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Specialisation Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {isPending ? "Saving…" : "Add Specialisation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edit Course ---------------- */

function EditCourseDialog({
  course, groups, specs, onClose, isPending, onSubmit,
}: {
  course: Course | null;
  groups: Group[];
  specs: Specialisation[];
  onClose: () => void;
  isPending: boolean;
  onSubmit: (id: number, body: CoursePayload) => void;
}) {
  // `seed` is exactly what the form was initialised with, straight from the raw
  // columns. The PATCH body is the diff between `form` and `seed`, so a field
  // the operator never touched is never sent — whatever the display coercion
  // would have made of it.
  const [seed, setSeed] = useState<CourseFormState>(EMPTY_COURSE_FORM);
  const [form, setForm] = useState<CourseFormState>(EMPTY_COURSE_FORM);

  const open = !!course;

  useEffect(() => {
    if (!course) return;
    const next = seedCourseForm(course);
    setSeed(next);
    setForm(next);
  }, [course]);

  const setField = <K extends keyof CourseFormState>(
    key: K,
    value: CourseFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // Stored values that match no option are surfaced rather than snapped to a default.
  const levelOptions = useMemo(() => selectOptions(LEVELS, seed.level), [seed.level]);
  const groupOptions = useMemo(
    () => selectOptions(groups.map((g) => g.name), seed.group),
    [groups, seed.group],
  );
  const specOptions = useMemo(
    () => selectOptions(specialisationOptions(specs), seed.spec),
    [specs, seed.spec],
  );
  const durationUnitOptions = useMemo(
    () => selectOptions(DURATION_UNITS, seed.durationUnit),
    [seed.durationUnit],
  );
  const studyModeOptions = useMemo(
    () => selectOptions(STUDY_MODES, seed.studyMode),
    [seed.studyMode],
  );
  // The stored specialisation may be a legacy JSON blob. It stays the option's
  // VALUE (so an untouched field diffs clean) but is LABELLED by its names.
  const specOptionLabel = (value: string) =>
    value === seed.spec && value !== "" ? specialisationLabel(value) : value;

  // What `title` would become — null means the derivation is not safe or not
  // warranted, so `title` is left exactly as stored. Shared with the preview.
  const nextTitle = useMemo(
    () => derivedCourseTitle(seed, form, course?.rawTitle ?? null),
    [seed, form, course],
  );
  // The operator changed a component but the stored title is kept (it is
  // hand-written, or a component is not a single name) — say so beside the preview.
  const titleKept =
    nextTitle === null &&
    (form.group !== seed.group || form.spec !== seed.spec) &&
    (course?.rawTitle ?? "").trim() !== "";

  const submit = () => {
    if (!course) return;

    const body: CoursePayload = {};

    if (form.level !== seed.level) body.level = form.level;
    if (form.group !== seed.group) body.short_name = form.group.trim();
    if (form.spec !== seed.spec) body.specialisations = form.spec.trim();

    // Duration is two columns: total_duration (magnitude) + duration (unit).
    const numChanged = form.durationNum !== seed.durationNum;
    const unitChanged = form.durationUnit !== seed.durationUnit;
    if (numChanged || unitChanged) {
      const magnitude = form.durationNum.trim();
      const unit = form.durationUnit.trim();
      if (numChanged || seed.durationComposite) {
        // The number input is type="number": clearing it yields "", and a unit
        // with no magnitude is not a duration. Guard the magnitude.
        if (magnitude === "") {
          toast.error("Duration can’t be cleared");
          return;
        }
        if (!DURATION_MAGNITUDE.test(magnitude)) {
          toast.error("Duration must be a positive number, e.g. 2");
          return;
        }
        body.total_duration = magnitude;
      }
      if (unitChanged || seed.durationComposite) {
        if (unit === "") {
          toast.error("Choose a duration unit");
          return;
        }
        // A composite "2 Years" row is written back split, the legacy way.
        body.duration = unit;
      }
    }

    if (form.studyMode !== seed.studyMode) body.study_mode = form.studyMode;
    if (form.eligibility !== seed.eligibility) {
      body.eligibility_criteria = form.eligibility.trim();
    }

    // "" means the stored status is NULL and the operator left it alone.
    if (form.status !== seed.status && form.status !== "") {
      body.status = form.status === "Active" ? 1 : 0;
    }

    // `title` is DERIVED — see derivedCourseTitle. null means "do not derive",
    // which covers both an untouched pair and a row where either component is
    // the empty stand-in for a NULL column. The preview above the Save button
    // reads the same value, so what is shown is what is sent.
    if (nextTitle !== null && nextTitle !== (course.rawTitle ?? "")) {
      body.title = nextTitle;
    }

    if (Object.keys(body).length === 0) {
      toast.info("No changes to save");
      onClose();
      return;
    }

    onSubmit(course.id, body);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Course</DialogTitle>
          <DialogDescription>Update course details.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Course Level</Label>
            <Select value={form.level} onValueChange={(v) => setField("level", v)}>
              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                {levelOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Course Group</Label>
            <Select value={form.group} onValueChange={(v) => setField("group", v)}>
              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                {groupOptions.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Specialisation</Label>
            <Select value={form.spec} onValueChange={(v) => setField("spec", v)}>
              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                {specOptions.map((name) => (
                  <SelectItem key={name} value={name}>{specOptionLabel(name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setField("status", v as Status)}>
              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Course Code</Label>
            <Input value={course?.code ?? ""} readOnly className="bg-muted/40 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Course Name</Label>
            {/* Exactly what will be stored: the derived title when (and only
                when) the derivation is safe and warranted, otherwise the title
                already on the row, untouched. */}
            <Input
              value={nextTitle ?? course?.rawTitle ?? ""}
              readOnly
              className="bg-muted/40"
            />
            {titleKept && (
              <p className="text-xs text-muted-foreground">
                The existing course name is kept.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Duration</Label>
            <Input
              value={form.durationNum}
              onChange={(e) => setField("durationNum", e.target.value)}
              type="number"
              min={0}
              step="any"
              placeholder="Not set"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Duration Unit</Label>
            <Select
              value={form.durationUnit}
              onValueChange={(v) => setField("durationUnit", v)}
            >
              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                {durationUnitOptions.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mode of Study</Label>
            <Select value={form.studyMode} onValueChange={(v) => setField("studyMode", v)}>
              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                {studyModeOptions.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Eligibility</Label>
            <Textarea
              value={form.eligibility}
              onChange={(e) => setField("eligibility", e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Only fields you change are sent. Blank fields are stored as empty and are
          left untouched.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edit Group ---------------- */

function EditGroupDialog({
  group, courses, coursesLoading, onClose, isPending, onSubmit,
}: {
  group: Group | null;
  courses: Course[];
  coursesLoading: boolean;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (id: number, body: GroupUpdatePayload) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [courseIds, setCourseIds] = useState<number[]>([]);
  // Snapshot of what the form was seeded with, for the submit-time diff.
  const [seed, setSeed] = useState<{
    name: string;
    description: string;
    /** The RESOLVED ids the picker was opened with — what the operator can see. */
    courseIds: number[];
    /** The `course_ids` column as stored, including ids that no longer resolve. */
    rawCourseIds: number[];
  }>({ name: "", description: "", courseIds: [], rawCourseIds: [] });

  const open = !!group;

  useEffect(() => {
    if (!group) return;
    // Seeded from the RAW columns, not from the "—" placeholder blankToDash renders.
    const next = {
      name: group.rawGroupName ?? "",
      description: group.rawDescription ?? "",
      courseIds: group.courseIds,
      rawCourseIds: group.rawCourseIds,
    };
    setSeed(next);
    setName(next.name);
    setDescription(next.description);
    setCourseIds(next.courseIds);
  }, [group]);

  const toggleCourseId = (id: number) =>
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    if (!group) return;

    const body: GroupUpdatePayload = {};

    if (name !== seed.name) {
      const trimmed = name.trim();
      if (trimmed.length < 3) {
        toast.error("Group name must be at least 3 characters");
        return;
      }
      body.group_name = trimmed;
    }

    if (description !== seed.description) body.description = description.trim();

    if (!sameIds(courseIds, seed.courseIds)) {
      if (courseIds.length === 0) {
        toast.error("Select at least one course");
        return;
      }
      // Never the picker's selection verbatim: that array is a filtered
      // projection of the column (soft-deleted courses are dropped before the
      // row reaches here). Merge the ids the operator could not see back in.
      body.course_ids = mergeCourseIds(seed.rawCourseIds, seed.courseIds, courseIds);
    }

    if (Object.keys(body).length === 0) {
      toast.info("No changes to save");
      onClose();
      return;
    }

    onSubmit(group.id, body);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Course Group</DialogTitle>
          <DialogDescription>Update group details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Group Code</Label>
            <Input value={group?.code ?? ""} readOnly className="bg-muted/40 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Group Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Courses *</Label>
            <CoursePicker
              courses={courses}
              selected={courseIds}
              onToggle={toggleCourseId}
              loading={coursesLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edit Specialisation ---------------- */

function EditSpecDialog({
  spec, onClose, isPending, onSubmit,
}: {
  spec: Specialisation | null;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (id: number, body: SpecPayload) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Snapshot of what the form was seeded with, for the submit-time diff.
  const [seed, setSeed] = useState<{ name: string; description: string }>({
    name: "",
    description: "",
  });

  const open = !!spec;

  useEffect(() => {
    if (!spec) return;
    // Seeded from the RAW columns, not from the "—" placeholder.
    const next = { name: spec.rawTitle ?? "", description: spec.rawDescription ?? "" };
    setSeed(next);
    setName(next.name);
    setDescription(next.description);
  }, [spec]);

  const submit = () => {
    if (!spec) return;

    const body: SpecPayload = {};

    if (name !== seed.name) {
      const trimmed = name.trim();
      if (!trimmed) { toast.error("Name required"); return; }
      body.title = trimmed;
    }

    if (description !== seed.description) body.description = description.trim();

    if (Object.keys(body).length === 0) {
      toast.info("No changes to save");
      onClose();
      return;
    }

    onSubmit(spec.id, body);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Specialisation</DialogTitle>
          <DialogDescription>Update specialisation details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input value={spec?.code ?? ""} readOnly className="bg-muted/40 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Specialisation Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={isPending}
            className="bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
