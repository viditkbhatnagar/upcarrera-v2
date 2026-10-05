import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
type Status = "Active" | "Inactive";

// `id` is the DB primary key — every write (PATCH /courses/:id etc.) is
// addressed by it. `code` is a DISPLAY-ONLY label derived from that id; it is
// never minted client-side and never sent to the API.
type Course = {
  id: number;
  code: string;
  group: string;
  specialisation: string;
  level: Level;
  duration: string;
  mappedUniversities: number;
  status: Status;
  // --- RAW server values ---------------------------------------------------
  // Everything above is COERCED for rendering and filtering: a NULL level reads
  // as "Certification", a NULL status as "Inactive", a NULL text column as "—".
  // Those placeholders must never reach a write, so Edit seeds from these raw
  // values instead and the PATCH body is diffed against them.
  rawTitle: string | null;
  rawShortName: string | null;
  rawLevel: string | null;
  rawDuration: string | null;
  rawSpecialisations: string | null;
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
  mappedCourses: number;
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

// Raw /courses row (Prisma `course`): see academics.service.ts listCourses.
interface ApiCourseRow {
  id: number | string;
  title: string | null;
  short_name: string | null;
  level: string | null;
  duration: string | null;
  total_duration: string | null;
  specialisations: string | null;
  university_id: number | string | null;
  status: number | string | null;
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
}

// Raw /specialisations row (Prisma `specialisations`).
interface ApiSpecRow {
  id: number | string;
  title: string | null;
  description: string | null;
  course_id: number | string | null;
}

// POST/PATCH /courses -> Create/UpdateCourseDto. Only columns that exist on
// `model course` are sent.
interface CoursePayload {
  title?: string;
  short_name?: string;
  level?: string;
  duration?: string;
  specialisations?: string;
  eligibility_criteria?: string;
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

// course.level is a free-text column; coerce to a valid Level so LEVEL_STYLE
// never resolves to undefined. Unknown / blank values fall back to "Certification".
function toLevel(value: string | null | undefined): Level {
  if (!value) return "Certification";
  const exact = LEVEL_KEYS.find((l) => l.toLowerCase() === String(value).trim().toLowerCase());
  return exact ?? "Certification";
}

function toStatus(value: number | string | null | undefined): Status {
  return String(value) === "1" ? "Active" : "Inactive";
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
  return {
    id: Number(r.id),
    code: `CRS-${String(r.id).padStart(4, "0")}`,
    group: blankToDash(r.short_name ?? r.title),
    specialisation: blankToDash(r.specialisations),
    level: toLevel(r.level),
    duration: blankToDash(r.duration ?? r.total_duration),
    // API has no mapped-universities count on the list row → render 0 (never fabricated).
    mappedUniversities: 0,
    status: toStatus(r.status),
    // Raw columns. Note `group` falls back to `title` and `duration` to
    // `total_duration` for DISPLAY only — the raw fields stay one-to-one with
    // the columns the PATCH actually writes.
    rawTitle: rawText(r.title),
    rawShortName: rawText(r.short_name),
    rawLevel: rawText(r.level),
    rawDuration: rawText(r.duration),
    rawSpecialisations: rawText(r.specialisations),
    rawStatus: rawStatus(r.status),
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
    // The count the table shows is the number of courses that still exist.
    totalCourses: courseIds.length,
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
    // `specialisations.course_id` is a single optional FK, so a row maps to at
    // most one course. No many-to-many table exists → never fabricate a count.
    mappedCourses: r.course_id != null ? 1 : 0,
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

const DURATION_TYPES = ["Months", "Years"];

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
 * The title a course would be STORED with after this edit, or null for
 * "leave `course.title` alone".
 *
 * `title` is DERIVED from short_name + specialisations, and a derived field is
 * still a write. Two rules:
 *   1. Derive only when a component actually changed — a level-only edit must
 *      never rewrite a hand-authored title.
 *   2. Derive only when BOTH components are genuinely present. "" is the
 *      stand-in for a NULL short_name / specialisations column, and
 *      interpolating it would collapse the title to a bare fragment
 *      ("Human Resources") on top of a real one ("Executive MBA — HR").
 *
 * The submit path and the read-only Course Name preview both read this one
 * function, so the preview can never show something different from what the
 * PATCH carries.
 */
function derivedCourseTitle(
  seed: CourseFormState,
  form: CourseFormState,
): string | null {
  if (form.group === seed.group && form.spec === seed.spec) return null;
  const g = form.group.trim();
  const s = form.spec.trim();
  if (g === "" || s === "") return null;
  return `${g} in ${s}`;
}

/** Edit-form state for a course, seeded ONLY from raw column values. */
type CourseFormState = {
  level: string;
  group: string;
  spec: string;
  durationNum: string;
  durationType: string;
  /** Non-null when the stored duration is not "<number> <unit>" — edited as free text. */
  durationFree: string | null;
  /** "" means the column is NULL — distinct from an explicit Inactive (0). */
  status: Status | "";
};

const EMPTY_COURSE_FORM: CourseFormState = {
  level: "",
  group: "",
  spec: "",
  durationNum: "",
  durationType: "",
  durationFree: null,
  status: "",
};

function seedCourseForm(course: Course): CourseFormState {
  const stored = (course.rawDuration ?? "").trim();
  const parsed = stored === "" ? null : stored.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  return {
    level: course.rawLevel ?? "",
    group: course.rawShortName ?? "",
    spec: course.rawSpecialisations ?? "",
    durationNum: parsed ? parsed[1] : "",
    durationType: parsed ? parsed[2].trim() : "",
    durationFree: stored !== "" && !parsed ? stored : null,
    status: course.rawStatus == null ? "" : course.rawStatus === 1 ? "Active" : "Inactive",
  };
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

function StatusBadge({ status }: { status: Status }) {
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
              <span className="truncate">
                {c.group} in {c.specialisation}
              </span>
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
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [editSpec, setEditSpec] = useState<Specialisation | null>(null);

  // --- Write flows ---------------------------------------------------------
  // Every dialog POSTs/PATCHes first, then invalidates the matching list query
  // and only then toasts + closes. Nothing is appended locally, so a row that
  // shows up in the table came back from the server.
  const apiMessage = (e: unknown) =>
    e instanceof ApiError ? e.message : "Something went wrong";

  const createCourseMut = useMutation({
    mutationFn: (body: CoursePayload) => apiPost("/courses", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Course created");
      setCreateCourseOpen(false);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const updateCourseMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: CoursePayload }) =>
      apiPatch(`/courses/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses"] });
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
      qc.invalidateQueries({ queryKey: ["specialisations"] });
      toast.success("Specialisation added");
      setAddSpecOpen(false);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const updateSpecMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: SpecPayload }) =>
      apiPatch(`/specialisations/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["specialisations"] });
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
        c.group.toLowerCase().includes(q) ||
        c.specialisation.toLowerCase().includes(q),
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

  const handleExport = () => toast.success("Export started");

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
                    <TableHead>Mapped Universities</TableHead>
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
                          <button className="font-mono text-xs font-medium text-primary hover:underline">
                            {c.code}
                          </button>
                        </TableCell>
                        <TableCell className="py-3 text-sm font-medium text-foreground">
                          {c.group} in {c.specialisation}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${LEVEL_STYLE[c.level]}`}>
                            {c.level}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-sm">{c.group}</TableCell>
                        <TableCell className="py-3 text-sm">{c.specialisation}</TableCell>
                        <TableCell className="py-3 text-sm">{c.duration}</TableCell>
                        <TableCell className="py-3">
                          <button className="text-sm font-medium text-primary hover:underline">
                            {c.mappedUniversities} Universities
                          </button>
                        </TableCell>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="View">
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
                      <TableCell className="py-3 text-sm">{s.mappedCourses}</TableCell>
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
  const [durationType, setDurationType] = useState("Years");
  const [eligibility, setEligibility] = useState("");
  const [status, setStatus] = useState<Status>("Active");

  // A fresh install has no group_courses / specialisations rows, so the
  // dropdowns would be empty and Create unusable. `short_name` and
  // `specialisations` are free-text @IsOptional columns server-side, so fall
  // back to a plain text field rather than blocking the form.
  const groupFreeText = groups.length === 0;
  const specFreeText = specs.length === 0;

  const courseName =
    group && spec ? `${group} in ${spec}` : group.trim() || spec.trim() || "";

  // Clear the form whenever the dialog closes — including the close the parent
  // performs after a confirmed POST.
  useEffect(() => {
    if (open) return;
    setLevel("");
    setGroup("");
    setSpec("");
    setDuration("");
    setDurationType("Years");
    setEligibility("");
    setStatus("Active");
  }, [open]);

  const submit = () => {
    // `short_name` is @IsOptional server-side, so Course Group is NOT required
    // — demanding it made Create impossible on a DB with no group_courses rows.
    if (!level || !spec || !duration) {
      toast.error("Please fill all required fields");
      return;
    }
    // Maps onto real `course` columns only: title / short_name / level /
    // duration / specialisations / eligibility_criteria / status (1|0). The
    // course code is derived from the DB id after insert, so nothing is minted
    // client-side. Blank optional fields are OMITTED, never sent as "".
    onSubmit({
      title: courseName,
      short_name: group.trim() || undefined,
      level,
      duration: `${duration} ${durationType}`,
      specialisations: spec.trim(),
      eligibility_criteria: eligibility.trim() || undefined,
      status: status === "Active" ? 1 : 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="max-w-2xl">
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
            {specFreeText ? (
              <>
                <Input
                  value={spec}
                  onChange={(e) => setSpec(e.target.value)}
                  placeholder="e.g. Finance"
                />
                <p className="text-xs text-muted-foreground">
                  No specialisations exist yet — type one.
                </p>
              </>
            ) : (
              <Select value={spec} onValueChange={setSpec}>
                <SelectTrigger><SelectValue placeholder="Select specialisation" /></SelectTrigger>
                <SelectContent>
                  {selectOptions(specs.map((s) => s.name), "").map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="2" type="number" />
          </div>

          <div className="space-y-1.5">
            <Label>Duration Type</Label>
            <Select value={durationType} onValueChange={setDurationType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Months">Months</SelectItem>
                <SelectItem value="Years">Years</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Eligibility</Label>
            <Input value={eligibility} onChange={(e) => setEligibility(e.target.value)} placeholder="e.g. Graduation in any discipline" />
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
    () => selectOptions(specs.map((s) => s.name), seed.spec),
    [specs, seed.spec],
  );
  const durationTypeOptions = useMemo(
    () => selectOptions(DURATION_TYPES, seed.durationType),
    [seed.durationType],
  );

  // What `title` would become — null means the derivation is not safe or not
  // warranted, so `title` is left exactly as stored. Shared with the preview.
  const nextTitle = useMemo(() => derivedCourseTitle(seed, form), [seed, form]);

  const submit = () => {
    if (!course) return;

    const body: CoursePayload = {};

    if (form.level !== seed.level) body.level = form.level;
    if (form.group !== seed.group) body.short_name = form.group.trim();
    if (form.spec !== seed.spec) body.specialisations = form.spec.trim();

    const durationChanged =
      form.durationNum !== seed.durationNum ||
      form.durationType !== seed.durationType ||
      form.durationFree !== seed.durationFree;
    if (durationChanged) {
      if (form.durationFree !== null) {
        const next = form.durationFree.trim();
        if (next === "") {
          toast.error("Duration can’t be cleared");
          return;
        }
        body.duration = next;
      } else {
        // The number input is type="number": clearing it yields "". Joining the
        // parts and testing the RESULT for emptiness is not enough — "" + "Years"
        // joins to "Years", a unit with no magnitude, which is not a duration and
        // would be written straight over a valid "2 Years". Guard the magnitude.
        const magnitude = form.durationNum.trim();
        const unit = form.durationType.trim();
        if (magnitude === "") {
          toast.error("Duration can’t be cleared");
          return;
        }
        body.duration = unit === "" ? magnitude : `${magnitude} ${unit}`;
      }
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
                  <SelectItem key={name} value={name}>{name}</SelectItem>
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
          </div>
          {form.durationFree !== null ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Duration</Label>
              <Input
                value={form.durationFree}
                onChange={(e) => setField("durationFree", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Stored as free text, shown exactly as saved.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Duration</Label>
                <Input
                  value={form.durationNum}
                  onChange={(e) => setField("durationNum", e.target.value)}
                  type="number"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration Type</Label>
                <Select
                  value={form.durationType}
                  onValueChange={(v) => setField("durationType", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                  <SelectContent>
                    {durationTypeOptions.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
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
