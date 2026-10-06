// Live catalogs for the Applications screens (QA AP05).
//
// The Add Lead dialog, the list filters and the New Application form used to
// offer hard-coded prototype lists (Amity / Manipal / "Priya Sharma" / "Jan
// 2026"). None of those matched a real row, so every filter returned nothing and
// every lead was saved against strings the database does not hold. Everything
// here comes from the API and carries its id, so requests send ids, never titles.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/session";

/** One selectable catalog entry. `value` is the id as a string (Select values are strings). */
export interface CatalogOption {
  value: string;
  label: string;
}

interface Paged<T> {
  items: T[];
  total?: number;
}

/** Catalogs are tiny and change rarely; one fetch per few minutes is plenty. */
const CATALOG_STALE_MS = 5 * 60 * 1000;
/** Big enough to return every row of these masters in one page. */
const CATALOG_LIMIT = 500;

function toOptions<T>(
  rows: T[] | undefined,
  id: (r: T) => number | string | null | undefined,
  label: (r: T) => string | null | undefined,
): CatalogOption[] {
  const out: CatalogOption[] = [];
  for (const r of rows ?? []) {
    const v = id(r);
    const l = label(r)?.trim();
    if (v != null && l) out.push({ value: String(v), label: l });
  }
  return out;
}

/* ---------------- Universities ---------------- */

interface UniversityRow {
  id: number;
  title: string | null;
}

export function useUniversityOptions() {
  const query = useQuery({
    queryKey: ["catalog", "universities"],
    queryFn: () => apiGet<Paged<UniversityRow>>("/universities", { limit: CATALOG_LIMIT }),
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () =>
      toOptions(query.data?.items, (u) => u.id, (u) => u.title).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [query.data],
  );
  return { ...query, options };
}

/* ---------------- Courses ---------------- */

interface CourseRow {
  id: number;
  title: string | null;
  university_id: number | null;
}

/**
 * Courses, scoped to `universityId` where the data allows.
 *
 * A course belongs to a university through course.university_id, but not every
 * course is tagged yet. When the chosen university has no tagged courses we fall
 * back to the full course list and say so (`scoped: false`) rather than offering
 * an empty dropdown that would block the form.
 *
 * `strict` (the forms that SAVE a course) narrows that fallback to the untagged
 * courses: a course tagged to another university is refused by the server, and
 * the list would keep showing that other university for the row.
 */
export function useCourseOptions(
  universityId: string | null | undefined,
  { strict = false }: { strict?: boolean } = {},
) {
  const all = useQuery({
    queryKey: ["catalog", "courses", "all"],
    queryFn: () => apiGet<Paged<CourseRow>>("/courses", { limit: CATALOG_LIMIT }),
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(() => {
    const rows = all.data?.items ?? [];
    const scopedRows = universityId
      ? rows.filter((c) => String(c.university_id ?? "") === universityId)
      : [];
    const useScoped = scopedRows.length > 0;
    const fallbackRows = strict && universityId ? rows.filter((c) => c.university_id == null) : rows;
    return {
      scoped: useScoped,
      options: toOptions(useScoped ? scopedRows : fallbackRows, (c) => c.id, (c) => c.title).sort(
        (a, b) => a.label.localeCompare(b.label),
      ),
    };
  }, [all.data, universityId, strict]);
  return { ...all, options: options.options, scoped: options.scoped };
}

/* ---------------- Specialisations ---------------- */

interface SpecialisationRow {
  id: number;
  title: string | null;
  course_id: number | null;
}

/** Specialisations of the chosen course, plus any not yet linked to a course. */
export function useSpecialisationOptions(courseId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["catalog", "specialisations"],
    queryFn: () =>
      apiGet<Paged<SpecialisationRow>>("/specialisations", { limit: CATALOG_LIMIT }),
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () =>
      toOptions(
        (query.data?.items ?? []).filter(
          (s) => s.course_id == null || String(s.course_id) === courseId,
        ),
        (s) => s.id,
        (s) => s.title,
      ),
    [query.data, courseId],
  );
  return { ...query, options };
}

/* ---------------- Intakes ---------------- */

interface SessionRow {
  session_id: number;
  session_title: string | null;
}

/**
 * Intakes. An application's intake is applications.session_id, which references
 * the `sessions` table (session_id, session_title) — the same source the
 * Enrollment screens group by. The newer `intake` master is not referenced by
 * applications, so it cannot be what a lead is saved against.
 */
export function useIntakeOptions() {
  const query = useQuery({
    queryKey: ["catalog", "intakes", "sessions"],
    queryFn: () => apiGet<Paged<SessionRow>>("/sessions", { limit: CATALOG_LIMIT }),
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () => toOptions(query.data?.items, (s) => s.session_id, (s) => s.session_title),
    [query.data],
  );
  return { ...query, options };
}

/* ---------------- Counsellors ---------------- */

interface ConsultantRow {
  id: number;
  name: string | null;
  status: number | null;
}

export interface CounsellorOptions {
  /** Every counsellor — for filtering, where inactive ones still own rows. */
  all: CatalogOption[];
  /** Active counsellors plus the signed-in user — for assigning a lead. */
  assignable: CatalogOption[];
  /** The signed-in user's id, the default assignee. */
  currentUserId: string | null;
}

export function useCounsellorOptions() {
  const query = useQuery({
    queryKey: ["catalog", "consultants"],
    queryFn: () => apiGet<Paged<ConsultantRow>>("/consultants", { limit: CATALOG_LIMIT }),
    staleTime: CATALOG_STALE_MS,
  });
  const counsellors = useMemo<CounsellorOptions>(() => {
    const rows = query.data?.items ?? [];
    const all = toOptions(rows, (c) => c.id, (c) => c.name).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const active = toOptions(
      rows.filter((c) => c.status == null || c.status === 1),
      (c) => c.id,
      (c) => c.name,
    ).sort((a, b) => a.label.localeCompare(b.label));

    const me = getUser();
    const currentUserId = me?.id != null ? String(me.id) : null;
    const assignable =
      currentUserId && !active.some((o) => o.value === currentUserId)
        ? [{ value: currentUserId, label: `${me?.name ?? "Me"} (you)` }, ...active]
        : active;
    return { all, assignable, currentUserId };
  }, [query.data]);
  return { ...query, ...counsellors };
}

/* ---------------- Teams ---------------- */

interface SalesTeamRow {
  id: number;
  name: string | null;
}

/**
 * Sales teams (GET /sales-teams). Used by the Applications list's team filter,
 * shown only to roles that can own more than one counsellor's rows.
 */
export function useTeamOptions() {
  const query = useQuery({
    queryKey: ["catalog", "sales-teams"],
    queryFn: () => apiGet<Paged<SalesTeamRow>>("/sales-teams", { limit: CATALOG_LIMIT }),
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () =>
      toOptions(query.data?.items, (t) => t.id, (t) => t.name).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [query.data],
  );
  return { ...query, options };
}

/* ---------------- Counsellor groups ---------------- */

interface GroupRow {
  id: number;
  name: string | null;
}

/** Counsellor groups (GET /consultants/groups) — the top of the hierarchy. */
export function useGroupOptions() {
  const query = useQuery({
    queryKey: ["catalog", "counsellor-groups"],
    queryFn: () => apiGet<Paged<GroupRow>>("/consultants/groups", { limit: CATALOG_LIMIT }),
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () =>
      toOptions(query.data?.items, (g) => g.id, (g) => g.name).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [query.data],
  );
  return { ...query, options };
}

/* ---------------- Lead sources ---------------- */

interface LeadSourceRow {
  id: number;
  title: string | null;
}

/**
 * Lead sources. applications.source is a free-text column, so the TITLE is what
 * gets saved; the option value is therefore the title, not the id.
 */
export function useLeadSourceOptions() {
  const query = useQuery({
    queryKey: ["catalog", "lead-sources"],
    // GET /lead-sources returns a bare array, not a paged object.
    queryFn: () => apiGet<LeadSourceRow[]>("/lead-sources"),
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () =>
      toOptions(query.data, (s) => s.title, (s) => s.title).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [query.data],
  );
  return { ...query, options };
}

/** The label of `value` in `options`, or null. */
export function labelOf(options: CatalogOption[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? null;
}

/* ---------------- Admission catalog cascade (Add Lead, IN04) ---------------- */
//
// Add Lead cascades university -> course -> OPEN intake through the three
// /admission-catalog endpoints, keyed by id. Only universities/courses/intakes
// that have a live, OPEN offering (university_course_intake) surface, so a lead
// can never be saved against a closed or untagged combination. Intake selection
// sends applications.intake_id; the server dual-writes session_id.

interface AdmissionUniversityRow {
  id: number;
  title: string | null;
}
interface AdmissionCourseRow {
  course_id: number;
  label: string | null;
}
interface AdmissionIntakeRow {
  id: number;
  name: string | null;
}

/** Step 1 — universities with at least one open offering. */
export function useAdmissionUniversityOptions() {
  const query = useQuery({
    queryKey: ["admission-catalog", "universities"],
    queryFn: () => apiGet<AdmissionUniversityRow[]>("/admission-catalog/universities"),
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () =>
      toOptions(query.data, (u) => u.id, (u) => u.title).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [query.data],
  );
  return { ...query, options };
}

/** Step 2 — that university's courses with an open offering (keyed by course_id). */
export function useAdmissionCourseOptions(universityId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["admission-catalog", "courses", universityId ?? null],
    queryFn: () =>
      apiGet<AdmissionCourseRow[]>(
        `/admission-catalog/universities/${universityId}/courses`,
      ),
    enabled: !!universityId,
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () => toOptions(query.data, (c) => c.course_id, (c) => c.label),
    [query.data],
  );
  return { ...query, options };
}

/** Step 3 — the open intakes for a (university, course) pair (keyed by intake id). */
export function useAdmissionIntakeOptions(
  universityId: string | null | undefined,
  courseId: string | null | undefined,
) {
  const query = useQuery({
    queryKey: ["admission-catalog", "intakes", universityId ?? null, courseId ?? null],
    queryFn: () =>
      apiGet<AdmissionIntakeRow[]>(
        `/admission-catalog/universities/${universityId}/courses/${courseId}/intakes`,
      ),
    enabled: !!universityId && !!courseId,
    staleTime: CATALOG_STALE_MS,
  });
  const options = useMemo(
    () => toOptions(query.data, (i) => i.id, (i) => i.name),
    [query.data],
  );
  return { ...query, options };
}
