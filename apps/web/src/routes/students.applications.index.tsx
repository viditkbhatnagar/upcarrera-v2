import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, ApiError } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  Plus,
  Download,
  Search,
  Filter,
  RefreshCcw,
  Eye,
  Pencil,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  ArrowRight,
  CheckCircle2,
  UserPlus,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStartCall, type CallHealth } from "@/components/calls/calls-ui";
import {
  useCounsellorOptions,
  useCourseOptions,
  useIntakeOptions,
  useUniversityOptions,
} from "@/components/applications/catalogs";
import { AddLeadDialog } from "@/components/applications/lead-dialog";
import { EditApplicationDialog } from "@/components/applications/edit-application-dialog";
import {
  type AppStatus,
  type Application,
  STATUS_ORDER,
  STATUS_STYLES,
  STATUS_DOT,
  FEE_STYLES,
  EMPTY,
  PAGE_SIZE,
  type ApplicationsListResponse,
  mapApiRow,
  CSV_COLUMNS,
  exportFilename,
} from "@/components/applications/list-model";
import {
  FilterInput,
  FilterSelect,
  IconBtn,
  BulkBtn,
  EmptyState,
} from "@/components/applications/list-bits";
import {
  downloadCsv,
  EXPORT_ROW_CAP,
  toCsv,
} from "@/components/applications/export-csv";

export const Route = createFileRoute("/students/applications/")({
  head: () => ({ meta: [{ title: "Applications — upCarrera" }] }),
  component: ApplicationsPage,
});


/* ---------------- Page ---------------- */

/** "" means "All" for every dropdown filter. */
interface DropdownFilters {
  universityId: string;
  courseId: string;
  sessionId: string;
  counsellorId: string;
}

const NO_DROPDOWNS: DropdownFilters = {
  universityId: "",
  courseId: "",
  sessionId: "",
  counsellorId: "",
};

function ApplicationsPage() {
  const [statusFilter, setStatusFilter] = useState<AppStatus | "All">("All");
  const [search, setSearch] = useState("");
  const [phone, setPhone] = useState("");
  const [appId, setAppId] = useState("");
  const [dropdowns, setDropdowns] = useState<DropdownFilters>(NO_DROPDOWNS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, Application>>(new Map());
  const [leadOpen, setLeadOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [exporting, setExporting] = useState(false);

  const universities = useUniversityOptions();
  const courses = useCourseOptions(dropdowns.universityId || null);
  const intakes = useIntakeOptions();
  const counsellors = useCounsellorOptions();

  // The three free-text filters are answered by the server so they reach every
  // application, not just the ten rows on screen (QA AP07). GET
  // /applications?search= matches name, email, phone, the custom/enrolment id and
  // the numeric application id, so one term covers all three boxes; the most
  // specific one wins.
  const serverSearch = appId.trim() || phone.trim() || search.trim();
  const debouncedSearch = useDebouncedValue(serverSearch);

  // Everything the server filters on, except pagination (QA AP05).
  const filterParams = useMemo(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(dropdowns.universityId ? { university_id: dropdowns.universityId } : {}),
      ...(dropdowns.courseId ? { course_id: dropdowns.courseId } : {}),
      ...(dropdowns.sessionId ? { session_id: dropdowns.sessionId } : {}),
      ...(dropdowns.counsellorId ? { consultant_id: dropdowns.counsellorId } : {}),
      ...(statusFilter !== "All" ? { stage: statusFilter } : {}),
    }),
    [debouncedSearch, dropdowns, statusFilter],
  );
  const filterKey = JSON.stringify(filterParams);

  // A narrowed result set has its own page 1 — otherwise filtering while on page 4
  // asks the server for page 4 of two results and shows an empty table.
  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["applications", "list", { page, limit: PAGE_SIZE, ...filterParams }],
    queryFn: () =>
      apiGet<ApplicationsListResponse>("/applications", {
        page,
        limit: PAGE_SIZE,
        ...filterParams,
      }),
    placeholderData: (prev) => prev,
  });

  // Click-to-call — the same role-gated flow the student profile uses, shown only
  // when the calling integration is configured (QA AP09).
  const { data: callHealth } = useQuery({
    queryKey: ["calls", "health"],
    queryFn: () => apiGet<CallHealth>("/calls/health"),
    staleTime: 5 * 60 * 1000,
  });
  const callsOn = callHealth?.configured ?? false;
  const { callingPhone, start } = useStartCall();

  const apiTotal = data?.total ?? 0;
  const pageRows = useMemo(() => (data?.items ?? []).map(mapApiRow), [data]);

  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Stage totals come from the server across the whole filtered set (QA AP06).
  const counts = useMemo(() => {
    const map: Record<AppStatus, number> = {
      "New Lead": 0,
      "Registration Fee Pending": 0,
      "Registration Fee Paid": 0,
      "Form Pending": 0,
      "Admin Verification Pending": 0,
      Enrolled: 0,
      Rejected: 0,
    };
    for (const [stage, n] of Object.entries(data?.counts ?? {})) {
      if (stage in map) map[stage as AppStatus] = n ?? 0;
    }
    return map;
  }, [data]);
  // Percentages are of every application in the filtered set, not the page.
  const countsTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  const setDropdown = (key: keyof DropdownFilters, value: string) =>
    setDropdowns((prev) =>
      // A course filter belongs to the chosen university; changing it clears the course.
      key === "universityId" ? { ...prev, universityId: value, courseId: "" } : { ...prev, [key]: value },
    );

  const toggleAll = () => {
    const next = new Map(selected);
    if (pageRows.length > 0 && pageRows.every((r) => selected.has(r.rowId))) {
      pageRows.forEach((r) => next.delete(r.rowId));
    } else {
      pageRows.forEach((r) => next.set(r.rowId, r));
    }
    setSelected(next);
  };
  const toggleOne = (row: Application) => {
    const next = new Map(selected);
    if (next.has(row.rowId)) next.delete(row.rowId);
    else next.set(row.rowId, row);
    setSelected(next);
  };

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setPhone("");
    setAppId("");
    setDropdowns(NO_DROPDOWNS);
    setPage(1);
  };

  /** Narrow the list to one application (after Add Lead, or from a duplicate notice). */
  const showInList = (displayId: string) => {
    resetFilters();
    setAppId(displayId);
  };

  // Export = every row matching the current filters, fetched from the server in
  // one request (capped), not just the visible page.
  const exportFiltered = async () => {
    if (apiTotal === 0 || exporting) return;
    setExporting(true);
    try {
      const all = await apiGet<ApplicationsListResponse>("/applications", {
        page: 1,
        limit: Math.min(apiTotal, EXPORT_ROW_CAP),
        ...filterParams,
      });
      const rows = all.items.map(mapApiRow);
      downloadCsv(exportFilename("filtered"), toCsv(rows, CSV_COLUMNS));
      if (all.total > rows.length) {
        toast.warning(
          `Exported the first ${rows.length.toLocaleString()} of ${all.total.toLocaleString()} matching applications. Narrow the filters to export the rest.`,
        );
      } else {
        toast.success(`Exported ${rows.length.toLocaleString()} applications.`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not export applications.");
    } finally {
      setExporting(false);
    }
  };

  const exportSelected = () => {
    const rows = [...selected.values()];
    if (rows.length === 0) return;
    downloadCsv(exportFilename("selected"), toCsv(rows, CSV_COLUMNS));
    toast.success(`Exported ${rows.length.toLocaleString()} selected applications.`);
  };

  const universityOptions = universities.options;
  const courseOptions = courses.options;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Student Management
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Applications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track all student applications.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportFiltered}
            disabled={apiTotal === 0 || exporting}
            title="Download every application matching the current filters as a CSV file"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={() => setLeadOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-hover"
          >
            <UserPlus className="h-4 w-4" />
            Add Lead
          </button>
          <Link
            to="/students/applications/new"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            New Application
          </Link>
        </div>
      </div>

      {/* Pipeline */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Application Pipeline</div>
            <div className="text-xs text-muted-foreground">Click a stage to filter the table</div>
          </div>
          {statusFilter !== "All" && (
            <button
              onClick={() => setStatusFilter("All")}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Clear stage
            </button>
          )}
        </div>
        <div className="flex items-stretch gap-1 overflow-x-auto scrollbar-thin pb-1">
          {STATUS_ORDER.map((s, i) => {
            const active = statusFilter === s;
            const pct = countsTotal > 0 ? (counts[s] / countsTotal) * 100 : 0;
            return (
              <div key={s} className="flex min-w-[160px] flex-1 items-center gap-1">
                <button
                  onClick={() => setStatusFilter(active ? "All" : s)}
                  className={cn(
                    "group relative flex w-full flex-col gap-2 rounded-xl border bg-background p-3 text-left transition hover:border-primary/40",
                    active ? "border-primary ring-2 ring-primary/20" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Stage {i + 1}
                    </span>
                  </div>
                  <div className="text-xs font-semibold leading-tight text-foreground">{s}</div>
                  <div className="flex items-end justify-between">
                    <div className="text-xl font-bold tracking-tight text-foreground">
                      {counts[s]}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{pct.toFixed(0)}%</div>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", STATUS_DOT[s])}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </button>
                {i < STATUS_ORDER.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput icon={Search} placeholder="Student name" value={search} onChange={setSearch} />
          <FilterInput icon={Phone} placeholder="Phone number" value={phone} onChange={setPhone} />
          <FilterInput icon={FileText} placeholder="Application ID" value={appId} onChange={setAppId} />
          <FilterSelect
            value={dropdowns.universityId}
            onChange={(v) => setDropdown("universityId", v)}
            options={universityOptions}
            placeholder="Universities"
            loading={universities.isLoading}
          />
          <FilterSelect
            value={dropdowns.courseId}
            onChange={(v) => setDropdown("courseId", v)}
            options={courseOptions}
            placeholder="Courses"
            loading={courses.isLoading}
          />
          <FilterSelect
            value={dropdowns.sessionId}
            onChange={(v) => setDropdown("sessionId", v)}
            options={intakes.options}
            placeholder="Intakes"
            loading={intakes.isLoading}
          />
          <FilterSelect
            value={dropdowns.counsellorId}
            onChange={(v) => setDropdown("counsellorId", v)}
            options={counsellors.all}
            placeholder="Counsellors"
            loading={counsellors.isLoading}
          />
          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{selected.size} selected</span>
            <button onClick={() => setSelected(new Map())} className="text-xs text-muted-foreground hover:text-foreground">
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <BulkBtn icon={Download} label="Export selected (CSV)" onClick={exportSelected} />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {isLoading ? "Loading…" : `${apiTotal.toLocaleString()} applications`}
            {statusFilter !== "All" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {statusFilter}
                <button onClick={() => setStatusFilter("All")} title="Clear stage">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {isFetching && !isLoading && (
              <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground/60 align-text-bottom" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Application Date</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading applications…</div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn't load applications</div>
              <div className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <EmptyState onCreate={() => setLeadOpen(true)} />
          ) : (
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      className="h-4 w-4 rounded border-border"
                      checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.rowId))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-3 w-12">Sl No</th>
                  <th className="px-3 py-3">App ID</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">University</th>
                  <th className="px-3 py-3">Course</th>
                  <th className="px-3 py-3">Batch</th>
                  <th className="px-3 py-3">Counsellor</th>
                  <th className="px-3 py-3" title="Registration fee">Fee</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a, i) => (
                  <tr
                    key={a.rowId}
                    className="border-t border-border transition hover:bg-muted/40"
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${a.id}`}
                        className="h-4 w-4 rounded border-border"
                        checked={selected.has(a.rowId)}
                        onChange={() => toggleOne(a)}
                      />
                    </td>
                    <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                      {(currentPage - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-primary">{a.id}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{a.date}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-foreground">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground">{a.email}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-foreground">{a.phone || EMPTY}</span>
                        {a.whatsapp && (
                          <span title="WhatsApp" className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                            <MessageCircle className="h-3 w-3" />
                          </span>
                        )}
                        {callsOn && a.phone && (
                          <button
                            title={`Call ${a.phone}`}
                            onClick={() => start(a.phone || null)}
                            disabled={callingPhone === a.phone}
                            className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-sky-600 hover:bg-sky-200 disabled:opacity-60"
                          >
                            {callingPhone === a.phone ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Phone className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground">{a.university}</td>
                    <td className="px-3 py-3 text-xs font-medium text-foreground">{a.course}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{a.batch}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {a.counsellorInitials}
                        </span>
                        <span className="text-xs text-foreground">{a.counsellor}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        title={
                          a.feeStatus === "Paid"
                            ? "Recorded when the application was converted to a student"
                            : "No registration-fee record for this application yet"
                        }
                        className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", FEE_STYLES[a.feeStatus])}
                      >
                        {a.feeStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setStatusFilter(a.status)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 transition hover:opacity-80",
                          STATUS_STYLES[a.status],
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[a.status])} />
                        {a.status}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to="/students/applications/$appId"
                          params={{ appId: String(a.rowId) }}
                          title="View"
                          className="group grid h-8 w-8 place-items-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                        <IconBtn title="Edit" icon={Pencil} onClick={() => setEditing(a)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && !isError && apiTotal > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}</span>–
              <span className="font-semibold text-foreground">{Math.min(currentPage * PAGE_SIZE, apiTotal)}</span> of{" "}
              <span className="font-semibold text-foreground">{apiTotal}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    "grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-xs font-semibold transition",
                    p === currentPage
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-foreground hover:bg-muted",
                  )}
                >
                  {p}
                </button>
              ))}
              {totalPages > 5 && <span className="px-1 text-muted-foreground">…</span>}
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AddLeadDialog open={leadOpen} onClose={() => setLeadOpen(false)} onShowInList={showInList} />
      <EditApplicationDialog
        applicationId={editing?.rowId ?? null}
        displayId={editing?.id ?? null}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
