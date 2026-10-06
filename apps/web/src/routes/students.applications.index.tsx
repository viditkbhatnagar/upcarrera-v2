import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
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
  CheckCircle2,
  UserPlus,
  AlertTriangle,
  Loader2,
  Pause,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  listApplications,
  applicationKeys,
  STAGES,
  type Stage,
} from "@/lib/api/applications";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useStartCall, type CallHealth } from "@/components/calls/calls-ui";
import { apiGet } from "@/lib/api";
import {
  useCounsellorOptions,
  useCourseOptions,
  useIntakeOptions,
  useUniversityOptions,
  useTeamOptions,
  useGroupOptions,
} from "@/components/applications/catalogs";
import { useAccess, canFilterByOwner } from "@/components/applications/use-access";
import { PIPELINE_STAGES, STAGE_META } from "@/components/applications/stage-model";
import { AddLeadDialog } from "@/components/applications/lead-dialog";
import { EditApplicationDialog } from "@/components/applications/edit-application-dialog";
import {
  type ListRowView,
  type ApplicationListResponse,
  EMPTY,
  PAGE_SIZE,
  mapRow,
  CSV_COLUMNS,
  exportFilename,
} from "@/components/applications/list-model";
import { FilterInput, FilterSelect, IconBtn, BulkBtn, EmptyState } from "@/components/applications/list-bits";
import { downloadCsv, EXPORT_ROW_CAP, toCsv } from "@/components/applications/export-csv";

const strish = fallback(
  z.union([z.string(), z.number(), z.boolean()]).transform((v) => String(v)).optional(),
  undefined,
);

const searchSchema = z.object({
  search: strish,
  university_id: strish,
  course_id: strish,
  session_id: strish,
  counsellor_id: strish,
  team_id: strish,
  group_id: strish,
  on_hold: strish,
  followup_due: strish,
  stage: fallback(z.enum(STAGES).optional(), undefined),
  page: fallback(z.coerce.number().int().min(1).optional(), undefined),
});

export const Route = createFileRoute("/students/applications/")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Applications — upCarrera" }] }),
  component: ApplicationsPage,
});

function ApplicationsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const access = useAccess();
  const showOwnerFilters = canFilterByOwner(access.data);

  const page = search.page ?? 1;
  const stage = search.stage;
  const onHold = search.on_hold === "true";
  const followupDue = search.followup_due === "true";

  const [draft, setDraft] = useState(search.search ?? "");
  useEffect(() => {
    setDraft(search.search ?? "");
  }, [search.search]);
  const debounced = useDebouncedValue(draft);
  useEffect(() => {
    const current = search.search ?? "";
    if (debounced !== current) {
      navigate({ search: (prev) => ({ ...prev, search: debounced || undefined, page: undefined }) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const universities = useUniversityOptions();
  const courses = useCourseOptions(search.university_id ?? null);
  const intakes = useIntakeOptions();
  const counsellors = useCounsellorOptions();
  const teams = useTeamOptions();
  const groups = useGroupOptions();

  const setFilter = (partial: Record<string, string | undefined>) =>
    navigate({ search: (prev) => ({ ...prev, ...partial, page: undefined }) });

  const setStage = (next: Stage | undefined) =>
    navigate({ search: (prev) => ({ ...prev, stage: next, page: undefined }) });

  const setPage = (p: number) =>
    navigate({ search: (prev) => ({ ...prev, page: p <= 1 ? undefined : p }) });

  const resetFilters = () =>
    navigate({
      search: () => ({}),
    });

  const [selected, setSelected] = useState<Map<number, ListRowView>>(new Map());
  const [leadOpen, setLeadOpen] = useState(false);
  const [editing, setEditing] = useState<ListRowView | null>(null);
  const [exporting, setExporting] = useState(false);

  const listParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(search.search ? { search: search.search } : {}),
      ...(search.university_id ? { university_id: search.university_id } : {}),
      ...(search.course_id ? { course_id: search.course_id } : {}),
      ...(search.session_id ? { session_id: search.session_id } : {}),
      ...(search.counsellor_id ? { consultant_id: search.counsellor_id } : {}),
      ...(search.team_id ? { team_id: search.team_id } : {}),
      ...(search.group_id ? { group_id: search.group_id } : {}),
      ...(stage ? { stage } : {}),
      ...(onHold ? { on_hold: "true" as const } : {}),
      ...(followupDue ? { followup_due: "true" as const } : {}),
    }),
    [search, page, stage, onHold, followupDue],
  );

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: [...applicationKeys.list, listParams],
    queryFn: () => listApplications(listParams),
    placeholderData: (prev) => prev,
  });

  const { data: callHealth } = useQuery({
    queryKey: ["calls", "health"],
    queryFn: () => apiGet<CallHealth>("/calls/health"),
    staleTime: 5 * 60 * 1000,
  });
  const callsOn = callHealth?.configured ?? false;
  const { callingPhone, start } = useStartCall();

  const apiTotal = data?.total ?? 0;
  const rows = useMemo(() => (data?.items ?? []).map(mapRow), [data]);
  const counts = data?.counts;
  const onHoldCount = data?.on_hold ?? 0;

  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // A sliding window of page buttons around the current page (plus first/last with
  // ellipses), so later pages stay reachable on large result sets — the pager used
  // to hard-cap at pages 1–5, stranding everything beyond page 5.
  const PAGE_WINDOW = 5;
  const pageList: (number | "ellipsis")[] = (() => {
    if (totalPages <= PAGE_WINDOW + 2) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const start = Math.max(2, Math.min(currentPage - 2, totalPages - PAGE_WINDOW + 1));
    const end = Math.min(totalPages - 1, start + PAGE_WINDOW - 1);
    const list: (number | "ellipsis")[] = [1];
    if (start > 2) list.push("ellipsis");
    for (let p = start; p <= end; p++) list.push(p);
    if (end < totalPages - 1) list.push("ellipsis");
    list.push(totalPages);
    return list;
  })();

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (rows.length > 0 && rows.every((r) => next.has(r.rowId))) {
        rows.forEach((r) => next.delete(r.rowId));
      } else {
        rows.forEach((r) => next.set(r.rowId, r));
      }
      return next;
    });
  };
  const toggleOne = (row: ListRowView) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.rowId)) next.delete(row.rowId);
      else next.set(row.rowId, row);
      return next;
    });
  };

  const showInList = (displayId: string) =>
    navigate({ search: () => ({ search: displayId }) });

  const exportFiltered = async () => {
    if (apiTotal === 0 || exporting) return;
    setExporting(true);
    try {
      const all = await apiGet<ApplicationListResponse>("/applications", {
        ...listParams,
        page: 1,
        limit: Math.min(apiTotal, EXPORT_ROW_CAP),
      });
      const exportRows = all.items.map(mapRow);
      downloadCsv(exportFilename("filtered"), toCsv(exportRows, CSV_COLUMNS));
      if (all.total > exportRows.length) {
        toast.warning(
          `Exported the first ${exportRows.length.toLocaleString()} of ${all.total.toLocaleString()} matching applications.`,
        );
      } else {
        toast.success(`Exported ${exportRows.length.toLocaleString()} applications.`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not export applications.");
    } finally {
      setExporting(false);
    }
  };

  const exportSelected = () => {
    const sel = [...selected.values()];
    if (sel.length === 0) return;
    downloadCsv(exportFilename("selected"), toCsv(sel, CSV_COLUMNS));
    toast.success(`Exported ${sel.length.toLocaleString()} selected applications.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Student Management
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Applications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The admission pipeline — every lead from capture to conversion.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportFiltered}
            disabled={apiTotal === 0 || exporting}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={() => setLeadOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-hover"
          >
            <UserPlus className="h-4 w-4" /> Add Lead
          </button>
          <Link
            to="/students/applications/new"
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground shadow-card transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" /> New Application
          </Link>
        </div>
      </div>

      {/* Pipeline */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Application pipeline</div>
            <div className="text-xs text-muted-foreground">Click a stage to filter the table</div>
          </div>
          {stage && (
            <button
              onClick={() => setStage(undefined)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Clear stage
            </button>
          )}
        </div>
        <div className="flex items-stretch gap-1 overflow-x-auto scrollbar-thin pb-1">
          {PIPELINE_STAGES.map((s, i) => (
            <div key={s} className="flex min-w-[150px] flex-1 items-center gap-1">
              <StageCard
                stage={s}
                count={counts?.[s] ?? 0}
                active={stage === s}
                loading={isLoading}
                onClick={() => setStage(stage === s ? undefined : s)}
              />
              {i < PIPELINE_STAGES.length - 1 && (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <SiblingCard
            label="Rejected"
            count={counts?.rejected ?? 0}
            dot={STAGE_META.rejected.dot}
            active={stage === "rejected"}
            onClick={() => setStage(stage === "rejected" ? undefined : "rejected")}
          />
          <SiblingCard
            label="On hold"
            count={onHoldCount}
            dot="bg-amber-500"
            icon={<Pause className="h-3.5 w-3.5" />}
            active={onHold}
            onClick={() =>
              setFilter({ on_hold: onHold ? undefined : "true", followup_due: undefined })
            }
          />
          {onHold && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-border"
                checked={followupDue}
                onChange={(e) => setFilter({ followup_due: e.target.checked ? "true" : undefined })}
              />
              Follow-up due only
            </label>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" /> Filters
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput icon={Search} placeholder="Name, phone or app ID" value={draft} onChange={setDraft} />
          <FilterSelect
            value={search.university_id ?? ""}
            onChange={(v) => setFilter({ university_id: v || undefined, course_id: undefined })}
            options={universities.options}
            placeholder="Universities"
            loading={universities.isLoading}
          />
          <FilterSelect
            value={search.course_id ?? ""}
            onChange={(v) => setFilter({ course_id: v || undefined })}
            options={courses.options}
            placeholder="Courses"
            loading={courses.isLoading}
          />
          <FilterSelect
            value={search.session_id ?? ""}
            onChange={(v) => setFilter({ session_id: v || undefined })}
            options={intakes.options}
            placeholder="Intakes"
            loading={intakes.isLoading}
          />
          {showOwnerFilters && (
            <>
              <FilterSelect
                value={search.counsellor_id ?? ""}
                onChange={(v) => setFilter({ counsellor_id: v || undefined })}
                options={counsellors.all}
                placeholder="Counsellors"
                loading={counsellors.isLoading}
              />
              <FilterSelect
                value={search.team_id ?? ""}
                onChange={(v) => setFilter({ team_id: v || undefined })}
                options={teams.options}
                placeholder="Teams"
                loading={teams.isLoading}
              />
              <FilterSelect
                value={search.group_id ?? ""}
                onChange={(v) => setFilter({ group_id: v || undefined })}
                options={groups.options}
                placeholder="Groups"
                loading={groups.isLoading}
              />
            </>
          )}
          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Reset
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
          <BulkBtn icon={Download} label="Export selected (CSV)" onClick={exportSelected} />
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {isLoading ? "Loading…" : `${apiTotal.toLocaleString()} applications`}
            {stage && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {STAGE_META[stage].label}
                <button onClick={() => setStage(undefined)} title="Clear stage">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {isFetching && !isLoading && (
              <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin align-text-bottom text-muted-foreground/60" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">newest first</span>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <LoadingRows />
          ) : isError ? (
            <ErrorRows message={error instanceof Error ? error.message : "Please try again."} />
          ) : rows.length === 0 ? (
            <EmptyState onCreate={() => setLeadOpen(true)} />
          ) : (
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      className="h-4 w-4 rounded border-border"
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.rowId))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-3 py-3">App ID</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Mobile</th>
                  <th className="px-3 py-3">University</th>
                  <th className="px-3 py-3">Course</th>
                  <th className="px-3 py-3">Intake</th>
                  <th className="px-3 py-3">Counsellor</th>
                  <th className="px-3 py-3">Stage</th>
                  <th className="px-3 py-3 text-right" title="Days in current stage">Days</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.rowId} className="border-t border-border transition hover:bg-muted/40">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${a.id}`}
                        className="h-4 w-4 rounded border-border"
                        checked={selected.has(a.rowId)}
                        onChange={() => toggleOne(a)}
                      />
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
                    <td className="px-3 py-3 text-xs text-muted-foreground">{a.intake}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {a.counsellorInitials}
                        </span>
                        <span className="text-xs text-foreground">{a.counsellor}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => setStage(a.stage)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition hover:opacity-80",
                          STAGE_META[a.stage].badge,
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", STAGE_META[a.stage].dot)} />
                        {a.stageLabel}
                        {a.onHold && <Pause className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                      {a.daysInStage}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to="/students/applications/$appId"
                          params={{ appId: String(a.rowId) }}
                          title="View"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground"
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
              {pageList.map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                    …
                  </span>
                ) : (
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
                ),
              )}
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

function StageCard({
  stage,
  count,
  active,
  loading,
  onClick,
}: {
  stage: Stage;
  count: number;
  active: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const meta = STAGE_META[stage];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-xl border bg-background p-3 text-left transition hover:border-primary/40",
        active ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Stage {meta.no}
          </span>
        </span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <div className="text-xs font-semibold leading-tight text-foreground">{meta.label}</div>
      <div className="text-xl font-bold tracking-tight text-foreground">
        {loading ? "—" : count.toLocaleString()}
      </div>
    </button>
  );
}

function SiblingCard({
  label,
  count,
  dot,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  dot: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left transition hover:border-primary/40",
        active ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <span className={cn("grid h-6 w-6 place-items-center rounded-full text-white", dot)}>
        {icon ?? <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums text-foreground">{count.toLocaleString()}</span>
    </button>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
      <div className="text-sm font-semibold text-foreground">Loading applications…</div>
    </div>
  );
}

function ErrorRows({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-red-500/60" />
      <div className="text-sm font-semibold text-foreground">Couldn't load applications</div>
      <div className="text-xs text-muted-foreground">{message}</div>
    </div>
  );
}
