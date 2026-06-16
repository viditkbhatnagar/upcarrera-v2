import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Download, Plus, Search, Pencil, Eye, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";

export const Route = createFileRoute("/universities/courses")({
  head: () => ({ meta: [{ title: "Courses — upCarrera" }] }),
  component: CoursesPage,
});

type Level = "Certification" | "Diploma" | "UG" | "PG" | "Doctorate";
type Status = "Active" | "Inactive";

type Course = {
  code: string;
  group: string;
  specialisation: string;
  level: Level;
  duration: string;
  mappedUniversities: number;
  status: Status;
};

type Group = {
  code: string;
  name: string;
  level: Level;
  description: string;
  totalCourses: number;
  status: Status;
};

type Specialisation = {
  code: string;
  name: string;
  description: string;
  mappedCourses: number;
  status: Status;
};

// --- Live API wiring -------------------------------------------------------
// Courses tab  -> GET /api/courses          ({ items, total, page, limit })
// Group tab    -> GET /api/group-courses    ({ items, total, page, limit })
// Specs tab    -> GET /api/specialisations  ({ items, total, page, limit })
//
// The list endpoints return raw snake_case rows. They do NOT join the
// group/specialisation *names* onto a course, nor a mapped-universities count,
// so we render what each endpoint gives us and derive sensible fallbacks for
// the rest (see the mappers below).
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

interface ApiGroupCourseRow {
  id: number | string;
  group_name: string | null;
  description: string | null;
  courses?: Array<{ id: number | string; title: string | null }> | null;
}

interface ApiSpecialisationRow {
  id: number | string;
  course_id: number | string | null;
  title: string | null;
  description: string | null;
}

const PAGE_SIZE = 100;

// Legacy `level` is a free-text column; only style it if it matches a known
// bucket, otherwise pass the raw value through and fall back to "UG" styling.
const KNOWN_LEVELS = new Set<Level>(LEVELS_FOR_MATCH());
function LEVELS_FOR_MATCH(): Level[] {
  return ["Certification", "Diploma", "UG", "PG", "Doctorate"];
}

function mapLevel(value: string | null): Level {
  if (!value) return "UG";
  const v = String(value).trim();
  if (KNOWN_LEVELS.has(v as Level)) return v as Level;
  const upper = v.toUpperCase();
  if (upper === "UG" || upper === "PG") return upper as Level;
  return "UG";
}

// Legacy `status` is typically 1 (active) / 0 (inactive); be permissive.
function mapStatus(value: number | string | null): Status {
  if (value === null || value === undefined) return "Inactive";
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "active" || v === "true" ? "Active" : "Inactive";
}

function mapCourseRow(r: ApiCourseRow): Course {
  const id = r.id;
  return {
    code: r.short_name?.trim() ? String(r.short_name) : `CRS-${String(id).padStart(4, "0")}`,
    // No group/specialisation join from the list endpoint: use the course title
    // as the display name and surface its raw specialisations blob where present.
    group: r.title?.trim() ? String(r.title) : `Course #${id}`,
    specialisation: r.specialisations?.trim() ? String(r.specialisations) : "—",
    level: mapLevel(r.level),
    duration: r.duration?.trim()
      ? String(r.duration)
      : r.total_duration?.trim()
        ? String(r.total_duration)
        : "—",
    // Mapped-universities count is not returned by this endpoint.
    mappedUniversities: r.university_id != null ? 1 : 0,
    status: mapStatus(r.status),
  };
}

function mapGroupRow(r: ApiGroupCourseRow): Group {
  return {
    code: `GRP-${String(r.id).padStart(3, "0")}`,
    name: r.group_name?.trim() ? String(r.group_name) : `Group #${r.id}`,
    // group_courses has no level column; default to a neutral bucket.
    level: "UG",
    description: r.description?.trim() ? String(r.description) : "—",
    totalCourses: Array.isArray(r.courses) ? r.courses.length : 0,
    // group_courses has no status column; treat live rows as Active.
    status: "Active",
  };
}

function mapSpecRow(r: ApiSpecialisationRow): Specialisation {
  return {
    code: `SPC-${String(r.id).padStart(3, "0")}`,
    name: r.title?.trim() ? String(r.title) : `Specialisation #${r.id}`,
    description: r.description?.trim() ? String(r.description) : "—",
    // mappedCourses count is not aggregated by this endpoint; a spec row is tied
    // to a single course_id, so reflect that (1 when present, else 0).
    mappedCourses: r.course_id != null ? 1 : 0,
    // specialisations has no status column; treat live rows as Active.
    status: "Active",
  };
}

const INITIAL_COURSES: Course[] = [
  { code: "CRS-0001", group: "MBA", specialisation: "Finance", level: "PG", duration: "2 Years", mappedUniversities: 8, status: "Active" },
  { code: "CRS-0002", group: "MBA", specialisation: "HR", level: "PG", duration: "2 Years", mappedUniversities: 6, status: "Active" },
  { code: "CRS-0003", group: "MBA", specialisation: "Marketing", level: "PG", duration: "2 Years", mappedUniversities: 7, status: "Active" },
  { code: "CRS-0004", group: "BBA", specialisation: "Logistics", level: "UG", duration: "3 Years", mappedUniversities: 4, status: "Active" },
  { code: "CRS-0005", group: "BBA", specialisation: "Finance", level: "UG", duration: "3 Years", mappedUniversities: 5, status: "Active" },
  { code: "CRS-0006", group: "BCA", specialisation: "Cloud Computing", level: "UG", duration: "3 Years", mappedUniversities: 3, status: "Active" },
  { code: "CRS-0007", group: "MCA", specialisation: "Data Science", level: "PG", duration: "2 Years", mappedUniversities: 5, status: "Active" },
  { code: "CRS-0008", group: "B.Com", specialisation: "Accounting", level: "UG", duration: "3 Years", mappedUniversities: 4, status: "Inactive" },
  { code: "CRS-0009", group: "MA", specialisation: "English", level: "PG", duration: "2 Years", mappedUniversities: 2, status: "Active" },
  { code: "CRS-0010", group: "BA", specialisation: "Economics", level: "UG", duration: "3 Years", mappedUniversities: 3, status: "Active" },
];

const INITIAL_GROUPS: Group[] = [
  { code: "GRP-001", name: "BA", level: "UG", description: "Bachelor of Arts", totalCourses: 6, status: "Active" },
  { code: "GRP-002", name: "BBA", level: "UG", description: "Bachelor of Business Administration", totalCourses: 8, status: "Active" },
  { code: "GRP-003", name: "B.Com", level: "UG", description: "Bachelor of Commerce", totalCourses: 5, status: "Active" },
  { code: "GRP-004", name: "BCA", level: "UG", description: "Bachelor of Computer Applications", totalCourses: 4, status: "Active" },
  { code: "GRP-005", name: "MA", level: "PG", description: "Master of Arts", totalCourses: 5, status: "Active" },
  { code: "GRP-006", name: "MBA", level: "PG", description: "Master of Business Administration", totalCourses: 12, status: "Active" },
  { code: "GRP-007", name: "MCA", level: "PG", description: "Master of Computer Applications", totalCourses: 3, status: "Active" },
];

const INITIAL_SPECIALISATIONS: Specialisation[] = [
  { code: "SPC-001", name: "Finance", description: "Corporate finance, investments", mappedCourses: 6, status: "Active" },
  { code: "SPC-002", name: "HR", description: "Human resource management", mappedCourses: 4, status: "Active" },
  { code: "SPC-003", name: "Marketing", description: "Marketing & branding", mappedCourses: 5, status: "Active" },
  { code: "SPC-004", name: "Logistics", description: "Supply chain & operations", mappedCourses: 3, status: "Active" },
  { code: "SPC-005", name: "Data Science", description: "Analytics & ML", mappedCourses: 4, status: "Active" },
  { code: "SPC-006", name: "Cloud Computing", description: "AWS, Azure, GCP", mappedCourses: 2, status: "Active" },
  { code: "SPC-007", name: "Accounting", description: "Financial accounting", mappedCourses: 3, status: "Inactive" },
];

const LEVELS: Level[] = ["Certification", "Diploma", "UG", "PG", "Doctorate"];

const LEVEL_STYLE: Record<Level, string> = {
  Certification: "bg-amber-50 text-amber-700 ring-amber-200",
  Diploma: "bg-sky-50 text-sky-700 ring-sky-200",
  UG: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PG: "bg-violet-50 text-violet-700 ring-violet-200",
  Doctorate: "bg-rose-50 text-rose-700 ring-rose-200",
};

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

// Renders a full-width loading / error / empty state row inside a table body.
// Returns null when there is data to show so the caller can render its rows.
function TableStatusRow({
  colSpan,
  isLoading,
  isError,
  isEmpty,
  emptyLabel,
}: {
  colSpan: number;
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  emptyLabel: string;
}) {
  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
          Loading…
        </TableCell>
      </TableRow>
    );
  }
  if (isError) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-rose-600">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Couldn’t load data. Please try again.
          </span>
        </TableCell>
      </TableRow>
    );
  }
  if (isEmpty) {
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </TableCell>
      </TableRow>
    );
  }
  return null;
}

function CoursesPage() {
  // Live data sources. Locally-created rows (via the dialogs) are kept in
  // separate overlay arrays and prepended/appended to the fetched rows, so the
  // create flows keep working without a write round-trip.
  const coursesQuery = useQuery({
    queryKey: ["courses", { page: 1, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<{ items: ApiCourseRow[]; total: number; page: number; limit: number }>("/courses", {
        page: 1,
        limit: PAGE_SIZE,
      }),
  });
  const groupsQuery = useQuery({
    queryKey: ["group-courses", { page: 1, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<{ items: ApiGroupCourseRow[]; total: number; page: number; limit: number }>(
        "/group-courses",
        { page: 1, limit: PAGE_SIZE },
      ),
  });
  const specsQuery = useQuery({
    queryKey: ["specialisations", { page: 1, limit: PAGE_SIZE }],
    queryFn: () =>
      apiGet<{ items: ApiSpecialisationRow[]; total: number; page: number; limit: number }>(
        "/specialisations",
        { page: 1, limit: PAGE_SIZE },
      ),
  });

  const [addedCourses, setAddedCourses] = useState<Course[]>([]);
  const [addedGroups, setAddedGroups] = useState<Group[]>([]);
  // Status overrides for the (server-backed) spec rows toggled in this session.
  const [specStatusOverride, setSpecStatusOverride] = useState<Record<string, Status>>({});
  const [addedSpecs, setAddedSpecs] = useState<Specialisation[]>([]);

  const courses = useMemo<Course[]>(
    () => [...addedCourses, ...(coursesQuery.data?.items ?? []).map(mapCourseRow)],
    [addedCourses, coursesQuery.data],
  );
  const groups = useMemo<Group[]>(
    () => [...(groupsQuery.data?.items ?? []).map(mapGroupRow), ...addedGroups],
    [addedGroups, groupsQuery.data],
  );
  const specs = useMemo<Specialisation[]>(() => {
    const live = (specsQuery.data?.items ?? []).map(mapSpecRow).map((s) =>
      specStatusOverride[s.code] ? { ...s, status: specStatusOverride[s.code] } : s,
    );
    return [...live, ...addedSpecs];
  }, [specsQuery.data, specStatusOverride, addedSpecs]);

  const setSpecs = (updater: (prev: Specialisation[]) => Specialisation[]) => {
    // The spec list's only in-place mutation is the Activate/Deactivate toggle;
    // capture the resulting status per code as a session override.
    const next = updater(specs);
    const overrides: Record<string, Status> = {};
    for (const s of next) overrides[s.code] = s.status;
    setSpecStatusOverride((prev) => ({ ...prev, ...overrides }));
  };

  const [tab, setTab] = useState("courses");
  const [query, setQuery] = useState("");

  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addSpecOpen, setAddSpecOpen] = useState(false);

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
          <div className="flex items-center gap-3 border-b p-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="pl-9"
              />
            </div>
          </div>

          <TabsContent value="courses" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4">Course Code</TableHead>
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
                  {coursesQuery.isLoading || coursesQuery.isError || filteredCourses.length === 0 ? (
                    <TableStatusRow
                      colSpan={9}
                      isLoading={coursesQuery.isLoading}
                      isError={coursesQuery.isError}
                      isEmpty={filteredCourses.length === 0}
                      emptyLabel="No courses found."
                    />
                  ) : (
                    filteredCourses.map((c) => (
                      <TableRow key={c.code} className="hover:bg-muted/40">
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
                        <TableCell className="py-3"><StatusBadge status={c.status} /></TableCell>
                        <TableCell className="py-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="View">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
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
          </TabsContent>

          <TabsContent value="groups" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4">Group Code</TableHead>
                    <TableHead>Group Name</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Total Courses</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupsQuery.isLoading || groupsQuery.isError || filteredGroups.length === 0 ? (
                    <TableStatusRow
                      colSpan={7}
                      isLoading={groupsQuery.isLoading}
                      isError={groupsQuery.isError}
                      isEmpty={filteredGroups.length === 0}
                      emptyLabel="No course groups found."
                    />
                  ) : (
                    filteredGroups.map((g) => (
                    <TableRow key={g.code} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{g.code}</TableCell>
                      <TableCell className="py-3 text-sm font-medium">{g.name}</TableCell>
                      <TableCell className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${LEVEL_STYLE[g.level]}`}>
                          {g.level}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">{g.description}</TableCell>
                      <TableCell className="py-3 text-sm">{g.totalCourses}</TableCell>
                      <TableCell className="py-3"><StatusBadge status={g.status} /></TableCell>
                      <TableCell className="py-3 pr-4 text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="specs" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4">Specialisation Code</TableHead>
                    <TableHead>Specialisation Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Mapped Courses</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {specsQuery.isLoading || specsQuery.isError || filteredSpecs.length === 0 ? (
                    <TableStatusRow
                      colSpan={6}
                      isLoading={specsQuery.isLoading}
                      isError={specsQuery.isError}
                      isEmpty={filteredSpecs.length === 0}
                      emptyLabel="No specialisations found."
                    />
                  ) : (
                    filteredSpecs.map((s) => (
                    <TableRow key={s.code} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.code}</TableCell>
                      <TableCell className="py-3 text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">{s.description}</TableCell>
                      <TableCell className="py-3 text-sm">{s.mappedCourses}</TableCell>
                      <TableCell className="py-3"><StatusBadge status={s.status} /></TableCell>
                      <TableCell className="py-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSpecs((prev) =>
                                prev.map((x) =>
                                  x.code === s.code
                                    ? { ...x, status: x.status === "Active" ? "Inactive" : "Active" }
                                    : x,
                                ),
                              )
                            }
                          >
                            {s.status === "Active" ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <CreateCourseDialog
        open={createCourseOpen}
        onClose={() => setCreateCourseOpen(false)}
        groups={groups}
        specs={specs}
        nextIndex={courses.length + 1}
        onCreate={(c) => setAddedCourses((prev) => [c, ...prev])}
      />

      <AddGroupDialog
        open={addGroupOpen}
        onClose={() => setAddGroupOpen(false)}
        nextIndex={groups.length + 1}
        onCreate={(g) => setAddedGroups((prev) => [...prev, g])}
      />

      <AddSpecDialog
        open={addSpecOpen}
        onClose={() => setAddSpecOpen(false)}
        nextIndex={specs.length + 1}
        onCreate={(s) => setAddedSpecs((prev) => [...prev, s])}
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
  nextIndex,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  groups: Group[];
  specs: Specialisation[];
  nextIndex: number;
  onCreate: (c: Course) => void;
}) {
  const [level, setLevel] = useState<Level | "">("");
  const [group, setGroup] = useState("");
  const [spec, setSpec] = useState("");
  const [duration, setDuration] = useState("");
  const [durationType, setDurationType] = useState("Years");
  const [eligibility, setEligibility] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("Active");

  const courseName = group && spec ? `${group} in ${spec}` : "";
  const courseCode = `CRS-${String(nextIndex).padStart(4, "0")}`;

  const reset = () => {
    setLevel(""); setGroup(""); setSpec(""); setDuration(""); setDurationType("Years");
    setEligibility(""); setDescription(""); setStatus("Active");
  };

  const handleClose = () => { reset(); onClose(); };

  const submit = () => {
    if (!level || !group || !spec || !duration) {
      toast.error("Please fill all required fields");
      return;
    }
    onCreate({
      code: courseCode,
      group,
      specialisation: spec,
      level: level as Level,
      duration: `${duration} ${durationType}`,
      mappedUniversities: 0,
      status,
    });
    toast.success(`${courseName} created`);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
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
            <Label>Course Group *</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => <SelectItem key={g.code} value={g.name}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Specialisation *</Label>
            <Select value={spec} onValueChange={setSpec}>
              <SelectTrigger><SelectValue placeholder="Select specialisation" /></SelectTrigger>
              <SelectContent>
                {specs.map((s) => <SelectItem key={s.code} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
            <Input value={courseCode} readOnly className="bg-muted/40 font-mono" />
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

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent-hover">Create Course</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Add Group ---------------- */

function AddGroupDialog({
  open, onClose, nextIndex, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  nextIndex: number;
  onCreate: (g: Group) => void;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("Active");

  const code = `GRP-${String(nextIndex).padStart(3, "0")}`;

  const handleClose = () => {
    setName(""); setLevel(""); setDescription(""); setStatus("Active");
    onClose();
  };

  const submit = () => {
    if (!name || !level) { toast.error("Name and level required"); return; }
    onCreate({ code, name, level: level as Level, description, totalCourses: 0, status });
    toast.success(`Group ${name} added`);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Course Group</DialogTitle>
          <DialogDescription>Reusable group like MBA, BBA, BCA.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Group Code</Label>
              <Input value={code} readOnly className="bg-muted/40 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Level *</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Group Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MBA" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent-hover">Add Group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Add Specialisation ---------------- */

function AddSpecDialog({
  open, onClose, nextIndex, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  nextIndex: number;
  onCreate: (s: Specialisation) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("Active");

  const code = `SPC-${String(nextIndex).padStart(3, "0")}`;

  const handleClose = () => {
    setName(""); setDescription(""); setStatus("Active");
    onClose();
  };

  const submit = () => {
    if (!name) { toast.error("Name required"); return; }
    onCreate({ code, name, description, mappedCourses: 0, status });
    toast.success(`Specialisation ${name} added`);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Specialisation</DialogTitle>
          <DialogDescription>Reusable specialisation like Finance, HR, Marketing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={code} readOnly className="bg-muted/40 font-mono" />
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
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent-hover">Add Specialisation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
