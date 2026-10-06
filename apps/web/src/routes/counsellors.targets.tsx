import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet } from "@/lib/api";
import {
  Download,
  Plus,
  Search,
  Eye,
  Pencil,
  Target as TargetIcon,
  CheckCircle2,
  XCircle,
  UserX,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCcw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { displayEmpId, useConsultantsList } from "@/components/teams/team-shared";
import { downloadCsv, toCsv, type CsvColumn } from "@/components/counsellors/export-csv";
import {
  type ConsultantRow,
  type TargetApiRow,
  type TargetRow,
  type TargetStatus,
  type TargetsResponse,
  STATUS_DOT,
  STATUS_STYLES,
  TARGET_TYPES,
  TARGET_TYPE_CODES,
  TARGETS_LIST_KEY,
  compareTargets,
  formatMonth,
  formatTargetValue,
  mapTarget,
  todayIso,
  typeMeta,
} from "@/components/counsellors/targets/target-model";
import { TargetFormDialog, TargetViewDialog } from "@/components/counsellors/targets/target-dialogs";

/* ----------------- Data ----------------- */

const FETCH_LIMIT = 1000;
const PAGE_SIZE = 10;

export const Route = createFileRoute("/counsellors/targets")({
  head: () => ({ meta: [{ title: "Targets — upCarrera" }] }),
  component: TargetsPage,
});

type StatusFilter = TargetStatus | "All" | "NoTargets";

/** Counsellor as the No-Targets panel shows it. Display only. */
interface CounsellorLite {
  id: number;
  displayId: string;
  name: string;
  team: string;
  manager: string;
}

const mapConsultant = (c: ConsultantRow): CounsellorLite => ({
  id: c.id,
  displayId: displayEmpId(c.employee_code, c.id),
  name: c.name?.trim() || `Unknown counsellor #${c.id}`,
  team: c.team_name?.trim() || "—",
  manager: c.manager_name?.trim() || "—",
});

const TARGET_CSV: CsvColumn<TargetRow>[] = [
  { header: "Target ID", value: (t) => t.code },
  { header: "Counsellor", value: (t) => t.counsellorName },
  { header: "Employee ID", value: (t) => t.counsellorDisplayId },
  { header: "Target Type", value: (t) => t.typeLabel },
  { header: "Period", value: (t) => t.period },
  { header: "Start Date", value: (t) => t.fromDate },
  { header: "End Date", value: (t) => t.toDate },
  { header: "Target Value", value: (t) => t.value },
  { header: "Unit", value: (t) => typeMeta(t.typeCode).unit },
  { header: "Achieved", value: (t) => t.achieved },
  { header: "Progress %", value: (t) => t.progressPct },
  { header: "Status", value: (t) => t.status },
];

const COUNSELLOR_CSV: CsvColumn<CounsellorLite>[] = [
  { header: "Employee ID", value: (c) => c.displayId },
  { header: "Counsellor", value: (c) => c.name },
  { header: "Team", value: (c) => c.team },
  { header: "Manager", value: (c) => c.manager },
];

function TargetsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [monthFilter, setMonthFilter] = useState<string>("All");
  const [counsellorFilter, setCounsellorFilter] = useState<string>("All");
  const [page, setPage] = useState(1);
  // Assign (target null) or Edit (raw server row); undefined = closed.
  const [formTarget, setFormTarget] = useState<TargetApiRow | null | undefined>(undefined);
  const [presetCounsellor, setPresetCounsellor] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);

  // Same key + request as the Counsellors / Teams screens, so the cache is shared.
  const consultantsQuery = useConsultantsList();
  const targetsQuery = useQuery({
    queryKey: TARGETS_LIST_KEY,
    queryFn: () => apiGet<TargetsResponse>("/consultant-targets", { limit: FETCH_LIMIT }),
  });

  const isLoading = consultantsQuery.isLoading || targetsQuery.isLoading;
  const isError = consultantsQuery.isError || targetsQuery.isError;

  const consultants = useMemo<ConsultantRow[]>(
    () => (consultantsQuery.data?.items ?? []) as ConsultantRow[],
    [consultantsQuery.data],
  );
  const ALL_COUNSELLORS = useMemo(() => consultants.map(mapConsultant), [consultants]);
  // The API orders by window already; sorting again keeps the paging honest
  // even if the list ever comes from somewhere else.
  const ALL_TARGETS = useMemo<TargetRow[]>(
    () => (targetsQuery.data?.items ?? []).map(mapTarget).sort(compareTargets),
    [targetsQuery.data],
  );

  // The server's summary covers EVERY target; the rows are capped at
  // FETCH_LIMIT. Counting the received rows silently dropped anything past the
  // cap from the KPIs, the month options and "Counsellors w/o Targets".
  const summary = targetsQuery.data?.summary;
  const serverTotal = targetsQuery.data?.total ?? ALL_TARGETS.length;
  const isTruncated = serverTotal > ALL_TARGETS.length;

  // Month options come from the targets that exist, newest first.
  const monthOptions = useMemo(
    () =>
      summary?.months ??
      [...new Set(ALL_TARGETS.map((t) => t.month).filter((m): m is string => m != null))]
        .sort()
        .reverse(),
    [summary, ALL_TARGETS],
  );

  const noTargetCounsellors = useMemo(() => {
    const withT = new Set<number | null>(
      summary?.consultant_ids ?? ALL_TARGETS.map((t) => t.counsellorId),
    );
    return ALL_COUNSELLORS.filter((c) => !withT.has(c.id));
  }, [summary, ALL_TARGETS, ALL_COUNSELLORS]);

  const filtered = useMemo(() => {
    if (statusFilter === "NoTargets") return [];
    const s = search.trim().toLowerCase();
    return ALL_TARGETS.filter((t) => {
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      if (typeFilter !== "All" && String(t.typeCode) !== typeFilter) return false;
      if (monthFilter !== "All" && t.month !== monthFilter) return false;
      if (counsellorFilter !== "All" && String(t.counsellorId) !== counsellorFilter) return false;
      if (
        s &&
        !t.counsellorName.toLowerCase().includes(s) &&
        !t.counsellorDisplayId.toLowerCase().includes(s) &&
        !t.code.toLowerCase().includes(s)
      )
        return false;
      return true;
    });
  }, [statusFilter, typeFilter, monthFilter, counsellorFilter, search, ALL_TARGETS]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const totals = useMemo(() => {
    const count = (s: TargetStatus) => ALL_TARGETS.filter((t) => t.status === s).length;
    return {
      total: serverTotal,
      active: summary?.active ?? count("Active"),
      ended: summary?.ended ?? count("Ended"),
      noTargets: noTargetCounsellors.length,
    };
  }, [summary, serverTotal, noTargetCounsellors.length, ALL_TARGETS]);

  const withPageReset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setTypeFilter("All");
    setMonthFilter("All");
    setCounsellorFilter("All");
    setPage(1);
  };

  const openAssign = (counsellorId: number | null = null) => {
    setPresetCounsellor(counsellorId);
    setFormTarget(null);
  };

  const exportCsv = () => {
    const stamp = todayIso();
    if (statusFilter === "NoTargets") {
      if (noTargetCounsellors.length === 0) {
        toast.error("Every counsellor has a target — nothing to export.");
        return;
      }
      downloadCsv(`counsellors-without-targets-${stamp}.csv`, toCsv(noTargetCounsellors, COUNSELLOR_CSV));
      return;
    }
    if (filtered.length === 0) {
      toast.error("No targets match the current filters — nothing to export.");
      return;
    }
    downloadCsv(`targets-${stamp}.csv`, toCsv(filtered, TARGET_CSV));
  };

  const toggleStatus = (s: StatusFilter) => {
    setStatusFilter(statusFilter === s ? "All" : s);
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-16 text-center shadow-card">
          <TargetIcon className="h-10 w-10 animate-pulse text-muted-foreground/50" />
          <div className="text-sm font-semibold text-foreground">Loading targets…</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-16 text-center shadow-card">
          <XCircle className="h-10 w-10 text-rose-500/70" />
          <div className="text-sm font-semibold text-foreground">Couldn't load targets</div>
          <div className="text-xs text-muted-foreground">
            Something went wrong while fetching the data.
          </div>
          <button
            onClick={() => {
              consultantsQuery.refetch();
              targetsQuery.refetch();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Counsellor Management
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Targets
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and monitor the targets.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => openAssign()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Assign Target
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={TargetIcon}
          label="Total Targets"
          value={totals.total}
          active={statusFilter === "All"}
          onClick={() => {
            setStatusFilter("All");
            setPage(1);
          }}
          accent="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Active Targets"
          value={totals.active}
          active={statusFilter === "Active"}
          onClick={() => toggleStatus("Active")}
          accent="bg-emerald-500/10 text-emerald-600"
          dot="bg-emerald-500"
        />
        <KpiCard
          icon={XCircle}
          label="Ended Targets"
          value={totals.ended}
          active={statusFilter === "Ended"}
          onClick={() => toggleStatus("Ended")}
          accent="bg-rose-500/10 text-rose-600"
          dot="bg-rose-500"
        />
        <KpiCard
          icon={UserX}
          label="Counsellors w/o Targets"
          value={totals.noTargets}
          active={statusFilter === "NoTargets"}
          onClick={() => toggleStatus("NoTargets")}
          accent="bg-amber-500/10 text-amber-600"
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="Search counsellor, ID, target"
              value={search}
              onChange={(e) => withPageReset(setSearch)(e.target.value)}
            />
          </div>
          <Select value={counsellorFilter} onValueChange={withPageReset(setCounsellorFilter)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Counsellor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Counsellors</SelectItem>
              {ALL_COUNSELLORS.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} · {c.displayId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={withPageReset(setMonthFilter)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Months</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={withPageReset(setTypeFilter)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Types</SelectItem>
              {TARGET_TYPE_CODES.map((code) => (
                <SelectItem key={code} value={String(code)}>
                  {TARGET_TYPES[code].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter === "NoTargets" ? "All" : statusFilter}
            onValueChange={(v) => withPageReset(setStatusFilter)(v as StatusFilter)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Upcoming">Upcoming</SelectItem>
              <SelectItem value="Ended">Ended</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Clear filters
            </button>
          </div>
        </div>
        <TypeLegend />
      </div>

      {/* No-Targets panel */}
      {statusFilter === "NoTargets" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">
              {noTargetCounsellors.length} counsellors without an assigned target
            </div>
            <button
              onClick={() => setStatusFilter("All")}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted/70"
            >
              Clear <X className="h-3 w-3" />
            </button>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead className="bg-muted/60">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Employee ID</th>
                  <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                  <th className="px-4 py-2.5 font-semibold">Team</th>
                  <th className="px-4 py-2.5 font-semibold">Manager</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {noTargetCounsellors.map((c, i) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                      {c.displayId}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{c.team}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{c.manager}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => openAssign(c.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          <Plus className="h-3.5 w-3.5" /> Assign
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Targets Table */
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">
              {filtered.length.toLocaleString()} targets
              {statusFilter !== "All" && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  {statusFilter}
                  <button onClick={() => setStatusFilter("All")} aria-label="Clear status filter">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Sorted by <span className="font-medium text-foreground">period start, newest first</span>
            </div>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            {pageRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <TargetIcon className="h-10 w-10 text-muted-foreground/50" />
                <div className="text-sm font-semibold text-foreground">No targets found</div>
                <div className="text-xs text-muted-foreground">
                  Try adjusting your filters or assign a new target.
                </div>
              </div>
            ) : (
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                    <th className="px-4 py-2.5 font-semibold">Period</th>
                    <th className="px-4 py-2.5 font-semibold">Target Type</th>
                    <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                    <th className="px-4 py-2.5 font-semibold">Target</th>
                    <th className="px-4 py-2.5 font-semibold">Progress</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t, i) => (
                    <TargetTableRow
                      key={t.targetId}
                      row={t}
                      serial={pageStart + i + 1}
                      onView={() => setViewingId(t.targetId)}
                      onEdit={() => setFormTarget(t.raw)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <div>
              Showing{" "}
              <span className="font-semibold text-foreground">
                {filtered.length === 0 ? 0 : pageStart + 1}
              </span>{" "}
              –{" "}
              <span className="font-semibold text-foreground">
                {Math.min(pageStart + PAGE_SIZE, filtered.length)}
              </span>{" "}
              of <span className="font-semibold text-foreground">{filtered.length}</span>
              {isTruncated && (
                <span className="ml-2 text-amber-700 dark:text-amber-400">
                  (table holds the newest {ALL_TARGETS.length.toLocaleString()} of{" "}
                  {serverTotal.toLocaleString()} targets; the cards count all of them)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="px-2 font-medium text-foreground">
                Page {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <TargetFormDialog
        open={formTarget !== undefined}
        onOpenChange={(open) => {
          if (!open) setFormTarget(undefined);
        }}
        target={formTarget ?? null}
        presetCounsellorId={presetCounsellor}
        counsellors={consultants}
      />
      <TargetViewDialog
        targetId={viewingId}
        onOpenChange={(open) => {
          if (!open) setViewingId(null);
        }}
        onEdit={(raw) => {
          setViewingId(null);
          setFormTarget(raw);
        }}
      />
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function TargetTableRow({
  row: t,
  serial,
  onView,
  onEdit,
}: {
  row: TargetRow;
  serial: number;
  onView: () => void;
  onEdit: () => void;
}) {
  const meta = typeMeta(t.typeCode);
  const Icon = meta.icon;
  const pct = t.progressPct;
  const barTone =
    pct == null ? "bg-muted" : pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <tr className="group border-b border-border last:border-0 transition hover:bg-muted/40">
      <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{serial}</td>
      <td className="px-4 py-3">
        <div className="text-sm font-semibold text-foreground">{t.period}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{t.code}</div>
      </td>
      <td className="px-4 py-3">
        <span
          title={meta.definition}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
            meta.tone,
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {t.counsellorName
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{t.counsellorName}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{t.counsellorDisplayId}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-foreground whitespace-nowrap">
        {formatTargetValue(t.value, t.typeCode)}
      </td>
      <td className="px-4 py-3">
        <div
          className="flex items-center gap-2"
          title={`Achieved ${formatTargetValue(t.achieved, t.typeCode)}`}
        >
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", barTone)}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>
          <span className="w-10 text-xs font-semibold text-foreground">
            {pct == null ? "—" : `${pct}%`}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
            STATUS_STYLES[t.status],
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[t.status])} />
          {t.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <IconBtn icon={Eye} label="View" onClick={onView} />
          <IconBtn icon={Pencil} label="Edit" onClick={onEdit} />
        </div>
      </td>
    </tr>
  );
}

/** What each target type measures — "Point Target" was never explained (QA TG02). */
function TypeLegend() {
  return (
    <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row sm:gap-6">
      {TARGET_TYPE_CODES.map((code) => {
        const meta = TARGET_TYPES[code];
        return (
          <div key={code} className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold text-foreground">{meta.label}:</span> {meta.definition}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  active,
  onClick,
  accent,
  dot,
}: {
  icon: typeof TargetIcon;
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
  accent?: string;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border bg-surface p-4 text-left shadow-card transition",
        onClick && "hover:border-primary/40",
        active ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            accent ?? "bg-muted text-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        {dot && <span className={cn("h-2 w-2 rounded-full", dot)} />}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight text-foreground">
        {value.toLocaleString()}
      </div>
    </button>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
