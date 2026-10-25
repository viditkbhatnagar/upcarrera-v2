import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Building2, Clock, Filter, GraduationCap, Layers, Search, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Paginated } from "@/components/counsellor/shared/paginated";
import { SortHead, useSort } from "@/components/counsellor/shared/sortable-head";
import { StatePanel } from "@/components/counsellor/shared/info";
import { mapCourse, modeStyle, monthsOf, NONE, type ApiCourseRow, type CourseView } from "./course-model";

interface Paged<T> {
  items: T[];
  total: number;
}

const CATALOG_LIMIT = 1000;

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Dropdown({
  value,
  onChange,
  options,
  all,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  all: string;
  label: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Courses catalogue (Naji's design) wired to GET /courses (the same catalogue the
 * admin Courses master reads; read-only here). Fees and intake dates are resolved
 * per university on the course detail screen.
 */
export function CounsellorCourses() {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [university, setUniversity] = useState("all");
  const [group, setGroup] = useState("all");
  const [level, setLevel] = useState("all");
  const [mode, setMode] = useState("all");
  const [duration, setDuration] = useState("all");
  const [specialisation, setSpecialisation] = useState("all");
  const [eligibility, setEligibility] = useState("all");
  const [more, setMore] = useState(false);

  const query = useQuery({
    queryKey: ["counsellor", "courses", "catalogue"],
    queryFn: () => apiGet<Paged<ApiCourseRow>>("/courses", { page: 1, limit: CATALOG_LIMIT }),
    staleTime: 5 * 60_000,
  });

  const courses = useMemo(() => (query.data?.items ?? []).map(mapCourse).filter((c) => c.active), [query.data]);

  const opts = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter((x) => x !== NONE))].sort();
    return {
      universities: uniq(courses.map((c) => c.university)),
      groups: uniq(courses.map((c) => c.group)),
      levels: uniq(courses.map((c) => c.level)),
      modes: uniq(courses.map((c) => c.mode)),
      durations: uniq(courses.map((c) => c.duration)).sort((a, b) => monthsOf(a) - monthsOf(b)),
      specialisations: uniq(courses.flatMap((c) => c.specialisations)),
      eligibilities: uniq(courses.map((c) => c.eligibility)),
    };
  }, [courses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      const hay = [c.name, c.code, c.university, c.group, c.level, ...c.specialisations].join(" ").toLowerCase();
      return (
        (!q || hay.includes(q)) &&
        (university === "all" || c.university === university) &&
        (group === "all" || c.group === group) &&
        (level === "all" || c.level === level) &&
        (mode === "all" || c.mode === mode) &&
        (duration === "all" || c.duration === duration) &&
        (specialisation === "all" || c.specialisations.includes(specialisation)) &&
        (eligibility === "all" || c.eligibility === eligibility)
      );
    });
  }, [courses, search, university, group, level, mode, duration, specialisation, eligibility]);

  const activeCount =
    [university, group, level, mode, duration, specialisation, eligibility].filter((v) => v !== "all").length +
    (search.trim() ? 1 : 0);
  const moreActive = [specialisation, eligibility].filter((v) => v !== "all").length;

  const clearAll = () => {
    setSearch("");
    setUniversity("all");
    setGroup("all");
    setLevel("all");
    setMode("all");
    setDuration("all");
    setSpecialisation("all");
    setEligibility("all");
  };

  const { sorted, sort } = useSort(filtered, {
    name: (c) => c.name,
    duration: (c) => monthsOf(c.duration),
    mode: (c) => c.mode,
    eligibility: (c) => c.eligibility,
    universities: (c) => c.universities,
  });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground mt-1">Explore courses, durations and eligibility to guide your students</p>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="grid">Grid</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="p-4 space-y-3 shadow-[var(--shadow-soft)] border-border/70">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search courses..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Dropdown value={university} onChange={setUniversity} options={opts.universities} all="All Universities" label="University" className="w-[190px]" />
          <Dropdown value={group} onChange={setGroup} options={opts.groups} all="All Courses" label="Course" className="w-[150px]" />
          <Dropdown value={level} onChange={setLevel} options={opts.levels} all="All Levels" label="Course Level" className="w-[150px]" />
          <Dropdown value={mode} onChange={setMode} options={opts.modes} all="All Modes" label="Learning Mode" className="w-[150px]" />
          <Dropdown value={duration} onChange={setDuration} options={opts.durations} all="All Durations" label="Duration" className="w-[150px]" />
          <Button variant="outline" size="sm" className="gap-2" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            <Filter className="h-4 w-4" /> {more ? "Fewer filters" : "More filters"}
            {moreActive > 0 && <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px]">{moreActive}</Badge>}
          </Button>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-2" onClick={clearAll}>
              <X className="h-4 w-4" /> Clear all ({activeCount})
            </Button>
          )}
        </div>

        {more && (
          <div className="grid grid-cols-1 gap-3 border-t border-border/70 pt-3 sm:grid-cols-2">
            <FilterField label="Specialisation">
              <Dropdown value={specialisation} onChange={setSpecialisation} options={opts.specialisations} all="All Specialisations" label="Specialisation" className="w-full" />
            </FilterField>
            <FilterField label="Eligibility">
              <Dropdown value={eligibility} onChange={setEligibility} options={opts.eligibilities} all="All Eligibility" label="Eligibility" className="w-full" />
            </FilterField>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {courses.length} courses
          {activeCount > 0 && ` · ${activeCount} filter${activeCount > 1 ? "s" : ""} applied`}
        </p>
      </Card>

      {query.isError ? (
        <StatePanel icon={<BookOpen className="h-7 w-7 text-destructive" />} title="Couldn't load courses" hint="Please refresh and try again." />
      ) : query.isLoading ? (
        <StatePanel icon={<BookOpen className="h-7 w-7 text-muted-foreground/60" />} title="Loading courses…" />
      ) : filtered.length === 0 ? (
        <StatePanel icon={<BookOpen className="h-7 w-7 text-muted-foreground/60" />} title="No courses match your filters" />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <Card className="shadow-[var(--shadow-soft)] border-border/70 overflow-hidden">
          <div className="overflow-x-auto">
            <Paginated items={sorted} pageSize={8}>
              {(rows) => (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <SortHead k="name" s={sort}>Course</SortHead>
                      <SortHead k="duration" s={sort}>Duration</SortHead>
                      <SortHead k="mode" s={sort}>Mode</SortHead>
                      <SortHead k="eligibility" s={sort}>Eligibility</SortHead>
                      <SortHead k="universities" s={sort} className="text-right">Universities</SortHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow key={c.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
                              <BookOpen className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{c.name}</p>
                              <p className="text-[11px] text-muted-foreground">{c.code} · {c.level}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{c.duration}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border", modeStyle(c.mode))}>{c.mode}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.eligibility}</TableCell>
                        <TableCell className="text-right text-sm">{c.universities}</TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link to="/universities/courses/$id" params={{ id: String(c.id) }}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Paginated>
          </div>
        </Card>
      )}
    </>
  );
}

function CourseCard({ course: c }: { course: CourseView }) {
  return (
    <Card className="overflow-hidden shadow-[var(--shadow-soft)] border-border/70 hover:shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5">
      <div className="h-24 bg-[image:var(--gradient-primary)] relative">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/20" />
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className="bg-white/20 backdrop-blur text-white border-white/30 hover:bg-white/30">{c.level}</Badge>
          <Badge className={cn("border", modeStyle(c.mode))}>{c.mode}</Badge>
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-semibold text-base leading-tight">{c.name}</h3>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary-soft-foreground">
          <Building2 className="h-3 w-3 shrink-0" />
          {c.universities > 1 ? `${c.universities} universities` : c.university}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
          {c.specialisations.length > 0 ? c.specialisations.join(", ") : "No specialisations listed"}
        </p>
        <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> {c.duration}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground min-w-0">
            <Layers className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.group}</span>
          </div>
          <div className="col-span-2 flex items-center gap-2 text-muted-foreground min-w-0">
            <GraduationCap className="h-3.5 w-3.5 shrink-0" /> <span className="leading-tight">{c.eligibility}</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
          <Button asChild size="sm">
            <Link to="/universities/courses/$id" params={{ id: String(c.id) }}>View Details</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
