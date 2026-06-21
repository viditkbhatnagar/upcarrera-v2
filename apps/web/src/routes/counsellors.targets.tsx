import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  IndianRupee,
  Trophy,
  GraduationCap,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
/* ----------------- API response shapes & mappers ----------------- */

// GET /consultants → { items: users[] , total, page, limit }
interface ConsultantApiRow {
  id: number;
  name: string | null;
  region: string | null;
}
interface ConsultantsResponse {
  items: ConsultantApiRow[];
  total: number;
  page: number;
  limit: number;
}

// GET /consultant-targets → { items: target[], total, page, limit }
// type: 1 = points-based, 2 = admission-count. value = target value.
// achieved + performance ("NN%") are computed server-side.
interface TargetApiRow {
  consultant_target_id: number;
  type: number | null;
  from_date: string | null;
  to_date: string | null;
  value: number | null;
  consultant_id: number | null;
  consultant_name: string | null;
  achieved: number;
  performance: string;
}
interface TargetsResponse {
  items: TargetApiRow[];
  total: number;
  page: number;
  limit: number;
}

// Same shape the JSX consumes from the old mock counsellor list.
interface CounsellorLite {
  empId: string;
  name: string;
  team: string;
  manager: string;
}

const FETCH_LIMIT = 1000;

const mapConsultant = (c: ConsultantApiRow): CounsellorLite => ({
  empId: String(c.id),
  name: c.name ?? "—",
  team: (c.region ?? "").trim() || "—",
  manager: "—",
});

// API type code → the design's TargetType label. type 1 → points, 2 → admissions.
const mapTargetType = (type: number | null): TargetType =>
  type === 1 ? "Point Target" : "Admission Target";

// Derive the target month (YYYY-MM) the JSX renders from the legacy date window.
const mapTargetMonth = (target: TargetApiRow): string => {
  const src = target.from_date ?? target.to_date;
  if (!src) return "—";
  const d = new Date(src);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const Route = createFileRoute("/counsellors/targets")({
  head: () => ({ meta: [{ title: "Targets — upCarrera" }] }),
  component: TargetsPage,
});

type TargetStatus = "Active" | "Inactive";
type TargetType = "Admission Target" | "Revenue Target" | "Point Target";

interface TargetRow {
  id: string;
  month: string; // YYYY-MM
  type: TargetType;
  counsellorEmpId: string;
  counsellorName: string;
  value: number;
  achieved: number;
  status: TargetStatus;
}

const TYPE_META: Record<
  TargetType,
  { icon: typeof TargetIcon; tone: string; format: (n: number) => string }
> = {
  "Admission Target": {
    icon: GraduationCap,
    tone: "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20",
    format: (n) => `${n} adm`,
  },
  "Revenue Target": {
    icon: IndianRupee,
    tone: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
    format: (n) => `₹${n.toLocaleString()}`,
  },
  "Point Target": {
    icon: Trophy,
    tone: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
    format: (n) => `${n} pts`,
  },
};

const STATUS_STYLES: Record<TargetStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
const STATUS_DOT: Record<TargetStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
};

const MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"];
const TYPES: TargetType[] = ["Admission Target", "Revenue Target", "Point Target"];

// Map one API target row into the exact TargetRow shape the JSX renders.
const mapTarget = (t: TargetApiRow): TargetRow => ({
  id: `TG-${String(t.consultant_target_id).padStart(4, "0")}`,
  month: mapTargetMonth(t),
  type: mapTargetType(t.type),
  counsellorEmpId: t.consultant_id != null ? String(t.consultant_id) : "—",
  counsellorName: t.consultant_name ?? "—",
  value: t.value ?? 0,
  achieved: t.achieved ?? 0,
  // A target is "Active" while its window has not closed; else "Inactive".
  status:
    t.to_date && !Number.isNaN(new Date(t.to_date).getTime())
      ? new Date(t.to_date).getTime() >= Date.now()
        ? "Active"
        : "Inactive"
      : "Active",
});

const formatMonth = (m: string) => {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

type StatusFilter = TargetStatus | "All" | "NoTargets";

function TargetsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TargetType | "All">("All");
  const [monthFilter, setMonthFilter] = useState<string>("All");
  const [counsellorFilter, setCounsellorFilter] = useState<string>("All");
  const [page, setPage] = useState(1);
  const [openAssign, setOpenAssign] = useState(false);
  const PAGE_SIZE = 10;

  const consultantsQuery = useQuery({
    queryKey: ["consultants", "targets-page"],
    queryFn: () =>
      apiGet<ConsultantsResponse>("/consultants", { limit: FETCH_LIMIT }),
  });
  const targetsQuery = useQuery({
    queryKey: ["consultant-targets", "targets-page"],
    queryFn: () =>
      apiGet<TargetsResponse>("/consultant-targets", { limit: FETCH_LIMIT }),
  });

  const isLoading = consultantsQuery.isLoading || targetsQuery.isLoading;
  const isError = consultantsQuery.isError || targetsQuery.isError;

  // Same variable names + shapes the JSX below consumes — only the source changed.
  const ALL_COUNSELLORS = useMemo<CounsellorLite[]>(
    () => (consultantsQuery.data?.items ?? []).map(mapConsultant),
    [consultantsQuery.data],
  );
  const ALL_TARGETS = useMemo<TargetRow[]>(
    () => (targetsQuery.data?.items ?? []).map(mapTarget),
    [targetsQuery.data],
  );

  const noTargetCounsellors = useMemo(() => {
    const withT = new Set(ALL_TARGETS.map((t) => t.counsellorEmpId));
    return ALL_COUNSELLORS.filter((c) => !withT.has(c.empId));
  }, [ALL_TARGETS, ALL_COUNSELLORS]);

  const filtered = useMemo(() => {
    if (statusFilter === "NoTargets") return [];
    return ALL_TARGETS.filter((t) => {
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      if (typeFilter !== "All" && t.type !== typeFilter) return false;
      if (monthFilter !== "All" && t.month !== monthFilter) return false;
      if (counsellorFilter !== "All" && t.counsellorEmpId !== counsellorFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !t.counsellorName.toLowerCase().includes(s) &&
          !t.counsellorEmpId.toLowerCase().includes(s) &&
          !t.id.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [statusFilter, typeFilter, monthFilter, counsellorFilter, search, ALL_TARGETS]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const totals = useMemo(() => {
    const active = ALL_TARGETS.filter((t) => t.status === "Active").length;
    const inactive = ALL_TARGETS.filter((t) => t.status === "Inactive").length;
    return {
      total: ALL_TARGETS.length,
      active,
      inactive,
      noTargets: noTargetCounsellors.length,
    };
  }, [noTargetCounsellors.length, ALL_TARGETS]);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setTypeFilter("All");
    setMonthFilter("All");
    setCounsellorFilter("All");
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-16 text-center shadow-card">
          <TargetIcon className="h-10 w-10 animate-pulse text-muted-foreground/50" />
          <div className="text-sm font-semibold text-foreground">
            Loading targets…
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface py-16 text-center shadow-card">
          <XCircle className="h-10 w-10 text-rose-500/70" />
          <div className="text-sm font-semibold text-foreground">
            Couldn't load targets
          </div>
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
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and monitor the targets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setOpenAssign(true)}
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
          onClick={() => {
            setStatusFilter(statusFilter === "Active" ? "All" : "Active");
            setPage(1);
          }}
          accent="bg-emerald-500/10 text-emerald-600"
          dot="bg-emerald-500"
        />
        <KpiCard
          icon={XCircle}
          label="Inactive Targets"
          value={totals.inactive}
          active={statusFilter === "Inactive"}
          onClick={() => {
            setStatusFilter(statusFilter === "Inactive" ? "All" : "Inactive");
            setPage(1);
          }}
          accent="bg-rose-500/10 text-rose-600"
          dot="bg-rose-500"
        />
        <KpiCard
          icon={UserX}
          label="Counsellors w/o Targets"
          value={totals.noTargets}
          active={statusFilter === "NoTargets"}
          onClick={() => {
            setStatusFilter(statusFilter === "NoTargets" ? "All" : "NoTargets");
            setPage(1);
          }}
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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={counsellorFilter} onValueChange={setCounsellorFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Counsellor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Counsellors</SelectItem>
              {ALL_COUNSELLORS.map((c) => (
                <SelectItem key={c.empId} value={c.empId}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Months</SelectItem>
              {MONTHS.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonth(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as TargetType | "All")}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter === "NoTargets" ? "All" : statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
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
                  <tr
                    key={c.empId}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                      {c.empId}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{c.team}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{c.manager}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => setOpenAssign(true)}
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
                  <button onClick={() => setStatusFilter("All")}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Sorted by <span className="font-medium text-foreground">Target Month</span>
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
                    <th className="px-4 py-2.5 font-semibold">Target Month</th>
                    <th className="px-4 py-2.5 font-semibold">Target Type</th>
                    <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                    <th className="px-4 py-2.5 font-semibold">Target</th>
                    <th className="px-4 py-2.5 font-semibold">Progress</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t, i) => {
                    const meta = TYPE_META[t.type];
                    const Icon = meta.icon;
                    const pct = Math.min(
                      100,
                      Math.round((t.achieved / t.value) * 100),
                    );
                    const barTone =
                      pct >= 80
                        ? "bg-emerald-500"
                        : pct >= 50
                          ? "bg-amber-500"
                          : "bg-rose-500";
                    return (
                      <tr
                        key={t.id}
                        className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                      >
                        <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-foreground">
                            {formatMonth(t.month)}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {t.id}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
                              meta.tone,
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {t.type}
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
                              <div className="text-sm font-semibold text-foreground">
                                {t.counsellorName}
                              </div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {t.counsellorEmpId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground whitespace-nowrap">
                          {meta.format(t.value)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full rounded-full", barTone)}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-10 text-xs font-semibold text-foreground">
                              {pct}%
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
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                STATUS_DOT[t.status],
                              )}
                            />
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <IconBtn icon={Eye} label="View" />
                            <IconBtn icon={Pencil} label="Edit" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <div>
              Showing{" "}
              <span className="font-semibold text-foreground">
                {(currentPage - 1) * PAGE_SIZE + 1}
              </span>{" "}
              –{" "}
              <span className="font-semibold text-foreground">
                {Math.min(currentPage * PAGE_SIZE, filtered.length)}
              </span>{" "}
              of <span className="font-semibold text-foreground">{filtered.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="px-2 font-medium text-foreground">
                Page {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 font-medium text-foreground hover:bg-muted disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <AssignTargetDialog open={openAssign} onOpenChange={setOpenAssign} />
    </div>
  );
}

/* ---------------- Helpers ---------------- */

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
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
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
    </Comp>
  );
}

function IconBtn({ icon: Icon, label }: { icon: typeof Eye; label: string }) {
  return (
    <button
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function AssignTargetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [type, setType] = useState<TargetType>("Admission Target");
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const consultantsQuery = useQuery({
    queryKey: ["consultants", "targets-page"],
    queryFn: () =>
      apiGet<ConsultantsResponse>("/consultants", { limit: FETCH_LIMIT }),
  });
  const ALL_COUNSELLORS = useMemo<CounsellorLite[]>(
    () => (consultantsQuery.data?.items ?? []).map(mapConsultant),
    [consultantsQuery.data],
  );

  const placeholder =
    type === "Revenue Target"
      ? "e.g. 500000"
      : type === "Point Target"
        ? "e.g. 120"
        : "e.g. 15";

  const unit =
    type === "Revenue Target" ? "₹" : type === "Point Target" ? "pts" : "adm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Assign Target</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Set a monthly admission, revenue or point target for a counsellor.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Counsellor">
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Pick counsellor" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {ALL_COUNSELLORS.map((c) => (
                    <SelectItem key={c.empId} value={c.empId}>
                      {c.name} · {c.empId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Target Month">
              <Input type="month" defaultValue={defaultMonth} />
            </Field>

            <Field label="Target Type">
              <Select
                value={type}
                onValueChange={(v) => setType(v as TargetType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={`Target Value (${unit})`}>
              <Input type="number" inputMode="numeric" placeholder={placeholder} />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Remarks">
                <Textarea
                  rows={3}
                  placeholder="Optional notes about this target"
                />
              </Field>
            </div>

            <Field label="Status">
              <Select defaultValue="Active">
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Assign Target
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}
