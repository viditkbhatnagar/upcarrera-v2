import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, List, Plus, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { apiGet } from "@/lib/api";
import { listApplications } from "@/lib/api/applications";
import { STAGE_META } from "@/components/applications/stage-model";
import { downloadCsv, toCsv, type CsvColumn } from "@/components/applications/export-csv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dayRange, type DateRange } from "@/lib/date-range";
import { DateRangePicker } from "@/components/counsellor/shared/date-range-picker";
import { Paginated } from "@/components/counsellor/shared/paginated";
import { SortHead, useSort } from "@/components/counsellor/shared/sortable-head";

// One row per student / application. Both sources are the SAME record-scoped
// endpoints the counsellor's My Enrollments / Applications use, so the server
// already limits them to the counsellor's own records. No incentive columns.
interface ApiStudentRow {
  id: number | string;
  student_id: number | string | null;
  enrollment_id: string | null;
  admission_status_label: string | null;
  enrollment_date: string | null;
  created_at: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  course_title: string | null;
  university_title: string | null;
  specialisation_title: string | null;
  session_title: string | null;
  source: string | null;
}

type Dataset = "enrollments" | "applications";
type Row = Record<string, string> & { _id: string };
interface Col {
  key: string;
  label: string;
  copy?: boolean;
  status?: boolean;
}

const FETCH_LIMIT = 2000;
const EMPTY = "—";

const COLS: Record<Dataset, Col[]> = {
  enrollments: [
    { key: "sid", label: "Student ID" },
    { key: "name", label: "Full Name", copy: true },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email", copy: true },
    { key: "university", label: "University" },
    { key: "course", label: "Course" },
    { key: "specialisation", label: "Specialisation" },
    { key: "intake", label: "Intake" },
    { key: "source", label: "Source" },
    { key: "date", label: "Enrolled" },
    { key: "status", label: "Status", status: true },
  ],
  applications: [
    { key: "sid", label: "Application ID" },
    { key: "date", label: "Date" },
    { key: "name", label: "Full Name", copy: true },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email", copy: true },
    { key: "university", label: "University" },
    { key: "course", label: "Course" },
    { key: "intake", label: "Intake" },
    { key: "days", label: "Days in Stage" },
    { key: "status", label: "Stage", status: true },
  ],
};

const DEFAULT_COLS: Record<Dataset, string[]> = {
  enrollments: ["sid", "name", "phone", "email", "university", "course", "intake", "date", "status"],
  applications: ["sid", "date", "name", "phone", "email", "university", "course", "status"],
};

const text = (v: string | number | null | undefined) =>
  v != null && String(v).trim() !== "" ? String(v).trim() : EMPTY;
const isoDay = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

function inRange(iso: string, r: { from: Date; to: Date } | null): boolean {
  if (!r) return true;
  if (!iso) return false;
  const d = new Date(`${iso}T12:00:00`);
  return d >= r.from && d <= r.to;
}

/**
 * Reports (Naji's design) built from real, counsellor-scoped data:
 *   GET /students     -> Enrollments dataset
 *   GET /applications -> Applications dataset
 * Filter by enrolment/created date, status, university, course and intake, pick the
 * columns, and export the result as CSV.
 */
export function CounsellorReports() {
  const [ds, setDs] = useState<Dataset>("enrollments");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<DateRange>({});
  const [selected, setSelected] = useState<Record<Dataset, string[]>>(DEFAULT_COLS);

  const students = useQuery({
    queryKey: ["counsellor", "reports", "students"],
    queryFn: () => apiGet<{ items: ApiStudentRow[] }>("/students", { page: 1, limit: FETCH_LIMIT }),
  });
  const applications = useQuery({
    queryKey: ["counsellor", "reports", "applications"],
    queryFn: () => listApplications({ page: 1, limit: FETCH_LIMIT }),
  });
  const active = ds === "enrollments" ? students : applications;

  const enrollRows = useMemo<Row[]>(
    () =>
      (students.data?.items ?? []).map((s) => ({
        _id: String(s.id),
        sid: s.enrollment_id?.trim() || `STU-${s.student_id ?? s.id}`,
        name: text(s.name),
        phone: text(s.phone),
        email: text(s.email),
        university: text(s.university_title),
        course: text(s.course_title),
        specialisation: text(s.specialisation_title),
        intake: text(s.session_title),
        source: text(s.source),
        date: isoDay(s.enrollment_date ?? s.created_at),
        status: s.admission_status_label?.trim() || "Unknown",
      })),
    [students.data],
  );

  const appRows = useMemo<Row[]>(
    () =>
      (applications.data?.items ?? []).map((a) => ({
        _id: String(a.application_id),
        sid: a.custom_application_id?.trim() || a.enrollment_id?.trim() || `APP-${a.application_id}`,
        date: isoDay(a.created_at),
        name: text(a.applicant_name),
        phone: text(a.applicant_phone),
        email: text(a.applicant_email),
        university: text(a.university_title),
        course: text(a.course_title),
        intake: text(a.intake_name ?? a.session_title),
        days: String(a.days_in_stage),
        status: STAGE_META[a.stage]?.label ?? a.stage,
      })),
    [applications.data],
  );

  const allRows = ds === "enrollments" ? enrollRows : appRows;
  const cols = COLS[ds];
  const shown = selected[ds].map((k) => cols.find((c) => c.key === k)).filter((c): c is Col => Boolean(c));
  const hidden = cols.filter((c) => !selected[ds].includes(c.key));

  const filterDefs = useMemo(() => {
    const uniq = (k: string) => [...new Set(allRows.map((r) => r[k]).filter((v) => v && v !== EMPTY))].sort();
    return [
      { key: "status", label: ds === "enrollments" ? "Status" : "Stage", all: ds === "enrollments" ? "All Statuses" : "All Stages" },
      { key: "university", label: "University", all: "All Universities" },
      { key: "course", label: "Course", all: "All Courses" },
      { key: "intake", label: "Intake", all: "All Intakes" },
    ].map((d) => ({ ...d, options: uniq(d.key) }));
  }, [allRows, ds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const range = dayRange(dates);
    return allRows.filter((r) => {
      if (q && ![r.name, r.email, r.sid, r.phone].some((v) => v.toLowerCase().includes(q))) return false;
      if (!inRange(r.date, range)) return false;
      return filterDefs.every((d) => !filters[d.key] || filters[d.key] === "all" || r[d.key] === filters[d.key]);
    });
  }, [allRows, search, dates, filters, filterDefs]);

  const getters = useMemo(
    () => Object.fromEntries(cols.map((c) => [c.key, (r: Row) => (c.key === "days" ? Number(r.days) : r[c.key])])),
    [cols],
  );
  const { sorted, sort } = useSort(filtered, getters);

  const byStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const switchDs = (next: Dataset) => {
    setDs(next);
    setFilters({});
    setSearch("");
    setDates({});
  };
  const clearAll = () => {
    setFilters({});
    setSearch("");
    setDates({});
  };
  const removeCol = (k: string) => {
    if (selected[ds].length <= 1) return toast.error("Keep at least one column");
    setSelected((s) => ({ ...s, [ds]: s[ds].filter((x) => x !== k) }));
  };
  const addCol = (k: string) => setSelected((s) => ({ ...s, [ds]: [...s[ds], k] }));
  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v);
    toast.success("Copied");
  };

  const exportCsv = () => {
    const columns: CsvColumn<Row>[] = shown.map((c) => ({ header: c.label, value: (r) => r[c.key] }));
    downloadCsv(`my-${ds}-report-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(sorted, columns));
  };

  const title = ds === "enrollments" ? "Enrollment Report" : "Application Report";
  const hasFilters = Boolean(search.trim() || dates.from || Object.values(filters).some((v) => v && v !== "all"));

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {title} ({filtered.length})
          </h1>
          <p className="text-sm text-muted-foreground">Your records only. Configure filters and columns, then export.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => void active.refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button className="gap-2" disabled={sorted.length === 0} onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["enrollments", "applications"] as Dataset[]).map((d) => (
          <Button key={d} size="sm" variant={ds === d ? "default" : "ghost"} className="gap-2" onClick={() => switchDs(d)}>
            <List className="h-4 w-4" /> {d === "enrollments" ? "Enrollments" : "Applications"}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4 border-border/70 shadow-[var(--shadow-soft)]">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total {ds === "enrollments" ? "enrollments" : "applications"}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{active.isLoading ? "…" : filtered.length.toLocaleString("en-IN")}</p>
        </Card>
        {byStatus.slice(0, 3).map(([label, count]) => (
          <Card key={label} className="p-4 border-border/70 shadow-[var(--shadow-soft)]">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground truncate">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{count.toLocaleString("en-IN")}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="p-4 border-border/70 h-fit space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Filters</h2>
            <button
              className="text-xs font-medium text-primary hover:underline disabled:opacity-40"
              disabled={!hasFilters}
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={ds === "enrollments" ? "Search students..." : "Search applications..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DateRangePicker label={ds === "enrollments" ? "Enrolled" : "Created"} value={dates} onChange={setDates} className="md:w-full" />
          {filterDefs.map((d) => (
            <Select key={d.key} value={filters[d.key] ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, [d.key]: v }))}>
              <SelectTrigger aria-label={d.label}>
                <SelectValue placeholder={d.all} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{d.all}</SelectItem>
                {d.options.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </Card>

        <div className="space-y-5 min-w-0">
          <Card className="p-4 border-border/70">
            <h2 className="font-semibold text-sm mb-3">Selected columns</h2>
            <div className="flex flex-wrap items-center gap-2">
              {shown.map((c, i) => (
                <span key={c.key} className="inline-flex items-center gap-1.5 rounded-md bg-primary-soft text-primary-soft-foreground px-2 py-1 text-xs font-medium">
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-primary text-primary-foreground text-[10px] px-1">{i + 1}</span>
                  {c.label}
                  <button aria-label={`Remove ${c.label}`} onClick={() => removeCol(c.key)} className="opacity-70 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {hidden.length > 0 && (
                <Select value="" onValueChange={addCol}>
                  <SelectTrigger className="w-auto min-w-36 h-8 text-xs [&>span]:line-clamp-none" aria-label="Add column">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap"><Plus className="h-3.5 w-3.5 shrink-0" /> Add column</span>
                  </SelectTrigger>
                  <SelectContent>
                    {hidden.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </Card>

          <Card className="p-0 border-border/70 overflow-hidden">
            <Paginated items={sorted} pageSize={10}>
              {(rows, offset) => (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        {shown.map((c) => (
                          <SortHead key={c.key} k={c.key} s={sort} className="whitespace-nowrap text-xs uppercase tracking-wide">
                            {c.label}
                          </SortHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {active.isError && (
                        <TableRow>
                          <TableCell colSpan={shown.length + 1} className="text-center text-destructive py-10">
                            Couldn't load this report. Please refresh.
                          </TableCell>
                        </TableRow>
                      )}
                      {active.isLoading && (
                        <TableRow>
                          <TableCell colSpan={shown.length + 1} className="text-center text-muted-foreground py-10">Loading…</TableCell>
                        </TableRow>
                      )}
                      {!active.isLoading && !active.isError && rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={shown.length + 1} className="text-center text-muted-foreground py-10">
                            No records match these filters.
                          </TableCell>
                        </TableRow>
                      )}
                      {rows.map((r, i) => (
                        <TableRow key={r._id}>
                          <TableCell className="text-muted-foreground">{offset + i + 1}</TableCell>
                          {shown.map((c) => (
                            <TableCell key={c.key} className="whitespace-nowrap">
                              {renderCell(c, r, copy)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Paginated>
          </Card>
        </div>
      </div>
    </>
  );
}

function renderCell(c: Col, r: Row, copy: (v: string) => void) {
  const v = r[c.key] || EMPTY;
  if (c.status) return <Badge variant="outline" className="font-medium">{v}</Badge>;
  if (c.key === "date") {
    return v === EMPTY ? v : new Date(`${v}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (c.copy) {
    return (
      <span className="inline-flex items-center gap-1.5 max-w-[220px]">
        <span className="truncate" title={v}>{v}</span>
        <button aria-label={`Copy ${c.label}`} onClick={() => copy(v)} className="text-muted-foreground hover:text-foreground shrink-0">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }
  return v;
}
