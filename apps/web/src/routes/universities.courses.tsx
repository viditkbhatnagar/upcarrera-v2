import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Download, Plus, Search, Pencil, Eye, X, AlertTriangle } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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
// bucket, otherwise fall back to "UG" styling.
const KNOWN_LEVELS = new Set<Level>(["Certification", "Diploma", "UG", "PG", "Doctorate"]);

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
  // Live data sources (same endpoints + page/limit the wired version used).
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

  // Local working copies seeded from live data. The new design's row toggles,
  // edit dialogs and add-* flows mutate these in place; there is no server-side
  // status column for groups/specs (confirmed against the create/update DTOs),
  // so those edits stay session-local while the rows themselves come from the API.
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [specs, setSpecs] = useState<Specialisation[]>([]);

  useEffect(() => {
    if (coursesQuery.data) setCourses(coursesQuery.data.items.map(mapCourseRow));
  }, [coursesQuery.data]);
  useEffect(() => {
    if (groupsQuery.data) setGroups(groupsQuery.data.items.map(mapGroupRow));
  }, [groupsQuery.data]);
  useEffect(() => {
    if (specsQuery.data) setSpecs(specsQuery.data.items.map(mapSpecRow));
  }, [specsQuery.data]);

  const [tab, setTab] = useState("courses");
  const [query, setQuery] = useState("");

  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addSpecOpen, setAddSpecOpen] = useState(false);

  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [editSpec, setEditSpec] = useState<Specialisation | null>(null);

  const toggleCourse = (code: string) =>
    setCourses((prev) =>
      prev.map((x) => (x.code === code ? { ...x, status: x.status === "Active" ? "Inactive" : "Active" } : x)),
    );
  const toggleGroup = (code: string) =>
    setGroups((prev) =>
      prev.map((x) => (x.code === code ? { ...x, status: x.status === "Active" ? "Inactive" : "Active" } : x)),
    );
  const toggleSpec = (code: string) =>
    setSpecs((prev) =>
      prev.map((x) => (x.code === code ? { ...x, status: x.status === "Active" ? "Inactive" : "Active" } : x)),
    );

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
            {query && (
              <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
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
                  {coursesQuery.isLoading || coursesQuery.isError || filteredCourses.length === 0 ? (
                    <TableStatusRow
                      colSpan={10}
                      isLoading={coursesQuery.isLoading}
                      isError={coursesQuery.isError}
                      isEmpty={filteredCourses.length === 0}
                      emptyLabel="No courses found."
                    />
                  ) : (
                    filteredCourses.map((c, i) => (
                      <TableRow key={c.code} className="hover:bg-muted/40">
                        <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</TableCell>
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
                              onCheckedChange={() => toggleCourse(c.code)}
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
          </TabsContent>

          <TabsContent value="groups" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="px-4 w-16">Sl No</TableHead>
                    <TableHead>Group Code</TableHead>
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
                      colSpan={8}
                      isLoading={groupsQuery.isLoading}
                      isError={groupsQuery.isError}
                      isEmpty={filteredGroups.length === 0}
                      emptyLabel="No course groups found."
                    />
                  ) : (
                    filteredGroups.map((g, i) => (
                    <TableRow key={g.code} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{g.code}</TableCell>
                      <TableCell className="py-3 text-sm font-medium">{g.name}</TableCell>
                      <TableCell className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${LEVEL_STYLE[g.level]}`}>
                          {g.level}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">{g.description}</TableCell>
                      <TableCell className="py-3 text-sm">{g.totalCourses}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={g.status === "Active"}
                            onCheckedChange={() => toggleGroup(g.code)}
                            aria-label="Toggle status"
                          />
                          <StatusBadge status={g.status} />
                        </div>
                      </TableCell>
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
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {specsQuery.isLoading || specsQuery.isError || filteredSpecs.length === 0 ? (
                    <TableStatusRow
                      colSpan={7}
                      isLoading={specsQuery.isLoading}
                      isError={specsQuery.isError}
                      isEmpty={filteredSpecs.length === 0}
                      emptyLabel="No specialisations found."
                    />
                  ) : (
                    filteredSpecs.map((s, i) => (
                    <TableRow key={s.code} className="hover:bg-muted/40">
                      <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.code}</TableCell>
                      <TableCell className="py-3 text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">{s.description}</TableCell>
                      <TableCell className="py-3 text-sm">{s.mappedCourses}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={s.status === "Active"}
                            onCheckedChange={() => toggleSpec(s.code)}
                            aria-label="Toggle status"
                          />
                          <StatusBadge status={s.status} />
                        </div>
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
          </TabsContent>
        </div>
      </Tabs>

      <CreateCourseDialog
        open={createCourseOpen}
        onClose={() => setCreateCourseOpen(false)}
        groups={groups}
        specs={specs}
        nextIndex={courses.length + 1}
        onCreate={(c) => setCourses((prev) => [c, ...prev])}
      />

      <AddGroupDialog
        open={addGroupOpen}
        onClose={() => setAddGroupOpen(false)}
        nextIndex={groups.length + 1}
        onCreate={(g) => setGroups((prev) => [...prev, g])}
      />

      <AddSpecDialog
        open={addSpecOpen}
        onClose={() => setAddSpecOpen(false)}
        nextIndex={specs.length + 1}
        onCreate={(s) => setSpecs((prev) => [...prev, s])}
      />

      <EditCourseDialog
        course={editCourse}
        groups={groups}
        specs={specs}
        onClose={() => setEditCourse(null)}
        onSave={(updated) =>
          setCourses((prev) => prev.map((x) => (x.code === updated.code ? updated : x)))
        }
      />

      <EditGroupDialog
        group={editGroup}
        onClose={() => setEditGroup(null)}
        onSave={(updated) =>
          setGroups((prev) => prev.map((x) => (x.code === updated.code ? updated : x)))
        }
      />

      <EditSpecDialog
        spec={editSpec}
        onClose={() => setEditSpec(null)}
        onSave={(updated) =>
          setSpecs((prev) => prev.map((x) => (x.code === updated.code ? updated : x)))
        }
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

/* ---------------- Edit Course ---------------- */

function EditCourseDialog({
  course, groups, specs, onClose, onSave,
}: {
  course: Course | null;
  groups: Group[];
  specs: Specialisation[];
  onClose: () => void;
  onSave: (c: Course) => void;
}) {
  const [level, setLevel] = useState<Level | "">("");
  const [group, setGroup] = useState("");
  const [spec, setSpec] = useState("");
  const [durationNum, setDurationNum] = useState("");
  const [durationType, setDurationType] = useState("Years");
  const [status, setStatus] = useState<Status>("Active");

  const open = !!course;

  useEffect(() => {
    if (course) {
      setLevel(course.level);
      setGroup(course.group);
      setSpec(course.specialisation);
      const [n, t] = course.duration.split(" ");
      setDurationNum(n ?? "");
      setDurationType(t ?? "Years");
      setStatus(course.status);
    }
  }, [course]);

  const submit = () => {
    if (!course) return;
    if (!level || !group || !spec || !durationNum) {
      toast.error("Please fill all required fields");
      return;
    }
    onSave({
      ...course,
      level: level as Level,
      group,
      specialisation: spec,
      duration: `${durationNum} ${durationType}`,
      status,
    });
    toast.success("Course updated");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Course</DialogTitle>
          <DialogDescription>Update course details.</DialogDescription>
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
            <Label>Course Code</Label>
            <Input value={course?.code ?? ""} readOnly className="bg-muted/40 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Course Name</Label>
            <Input value={group && spec ? `${group} in ${spec}` : ""} readOnly className="bg-muted/40" />
          </div>
          <div className="space-y-1.5">
            <Label>Duration *</Label>
            <Input value={durationNum} onChange={(e) => setDurationNum(e.target.value)} type="number" />
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent-hover">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edit Group ---------------- */

function EditGroupDialog({
  group, onClose, onSave,
}: {
  group: Group | null;
  onClose: () => void;
  onSave: (g: Group) => void;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level | "">("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("Active");

  const open = !!group;

  useEffect(() => {
    if (group) {
      setName(group.name);
      setLevel(group.level);
      setDescription(group.description);
      setStatus(group.status);
    }
  }, [group]);

  const submit = () => {
    if (!group) return;
    if (!name || !level) { toast.error("Name and level required"); return; }
    onSave({ ...group, name, level: level as Level, description, status });
    toast.success("Group updated");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Course Group</DialogTitle>
          <DialogDescription>Update group details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Group Code</Label>
              <Input value={group?.code ?? ""} readOnly className="bg-muted/40 font-mono" />
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
            <Input value={name} onChange={(e) => setName(e.target.value)} />
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
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent-hover">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edit Specialisation ---------------- */

function EditSpecDialog({
  spec, onClose, onSave,
}: {
  spec: Specialisation | null;
  onClose: () => void;
  onSave: (s: Specialisation) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("Active");

  const open = !!spec;

  useEffect(() => {
    if (spec) {
      setName(spec.name);
      setDescription(spec.description);
      setStatus(spec.status);
    }
  }, [spec]);

  const submit = () => {
    if (!spec) return;
    if (!name) { toast.error("Name required"); return; }
    onSave({ ...spec, name, description, status });
    toast.success("Specialisation updated");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Specialisation</DialogTitle>
          <DialogDescription>Update specialisation details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={spec?.code ?? ""} readOnly className="bg-muted/40 font-mono" />
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
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent-hover">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
