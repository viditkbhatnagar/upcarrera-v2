import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Download,
  Plus,
  Search,
  Filter,
  RefreshCcw,
  Eye,
  Pencil,
  Phone,
  MessageCircle,
  X,
  CalendarDays,
  Users,
  UserCheck,
  UserX,
  UserMinus,
  ChevronLeft,
  ChevronRight,
  Hash,
  Camera,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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
import {
  STATUS_DOT,
  STATUS_STYLES,
  TEAMS,
  GROUPS,
  TEAM_LEADERS,
  MANAGERS,
  DESIGNATIONS,
  type Counsellor,
  type CounsellorStatus,
} from "@/lib/counsellors-data";

export const Route = createFileRoute("/counsellors/counsellors")({
  head: () => ({ meta: [{ title: "Counsellors — upCarrera" }] }),
  component: CounsellorsPage,
});

type StatusFilter = CounsellorStatus | "All";

// --- Live API wiring (GET /api/consultants) ------------------------------
// A consultant is a `users` row with role_id = 6, returned by the API after
// stripSecrets. We map those real columns into the screen's existing
// Counsellor row shape. Columns the legacy users table has no field for
// (team / team leader / group / manager / active target) fall back to "—" / 0
// rather than inventing data. Employee ID = users.code, else the numeric id.
interface ApiConsultant {
  id: number | string;
  code?: number | string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: number | string | null;
  region?: string | null;
  doj?: string | null;
  dob?: string | null;
  gender?: string | null;
  created_at?: string | null;
}

interface ConsultantsListResponse {
  items: ApiConsultant[];
  total: number;
  page: number;
  limit: number;
}

// The legacy users.status is an Int (default 1). 1 = Active, 2 = On Leave,
// everything else (0 / null) = Inactive — keeping the three UI states intact.
const STATUS_TO_CODE: Record<CounsellorStatus, number> = {
  Active: 1,
  "On Leave": 2,
  Inactive: 0,
};

function toCounsellorStatus(status: number | string | null | undefined): CounsellorStatus {
  const n = status == null ? null : Number(status);
  if (n === 1) return "Active";
  if (n === 2) return "On Leave";
  return "Inactive";
}

const EMPTY = "—";

function asText(value: string | number | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD for the date-range filter
}

// Map one API consultant onto the screen's existing Counsellor row shape.
// Fields without a users-table source use graceful fallbacks (never faked).
function mapToRow(c: ApiConsultant): Counsellor {
  // Employee ID = the user's unique system id. (The `code` column is NOT a
  // per-user identifier — it carries the same value across users, e.g. 91.)
  // The row links to /counsellors/profile/$empId, so empId must be the real id
  // for the profile page to look it up.
  const empId = String(c.id);
  return {
    empId,
    name: asText(c.name) === EMPTY ? "" : String(c.name),
    email: asText(c.email) === EMPTY ? "" : String(c.email),
    phone: asText(c.phone),
    team: EMPTY,
    teamLeader: EMPTY,
    group: asText(c.region), // region is the closest grouping the users table carries
    manager: EMPTY,
    activeTarget: 0,
    achieved: 0,
    status: toCounsellorStatus(c.status),
    joiningDate: toDateInput(c.doj ?? c.created_at),
    designation: EMPTY,
    gender: (c.gender as Counsellor["gender"]) ?? "Other",
    dob: toDateInput(c.dob),
  };
}

function CounsellorsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [empId, setEmpId] = useState("");
  const [team, setTeam] = useState("All");
  const [group, setGroup] = useState("All");
  const [tl, setTl] = useState("All");
  const [mgr, setMgr] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openAdd, setOpenAdd] = useState(false);
  const PAGE_SIZE = 10;

  // Live consultants list. status runs server-side (users.status Int); the
  // search box also goes to the server (name/phone/email). The remaining UI
  // filters (empId / team / group / TL / manager / date range) refine the
  // fetched page client-side over the real mapped values.
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["consultants", "list", { page, limit: PAGE_SIZE, statusFilter, search }],
    queryFn: () =>
      apiGet<ConsultantsListResponse>("/consultants", {
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        status: statusFilter === "All" ? undefined : STATUS_TO_CODE[statusFilter],
      }),
  });

  // Global KPI counts: the paged list can't see all consultants, so fetch the
  // full consultant set once and count by status over that complete set.
  const { data: consultantsAll } = useQuery({
    queryKey: ["consultants", "all"],
    queryFn: () => apiGet<ConsultantsListResponse>("/consultants", { limit: 2000 }),
    staleTime: 60 * 1000,
  });

  const apiTotal = data?.total ?? 0;
  const allRows = useMemo(() => (data?.items ?? []).map(mapToRow), [data]);

  // Client-side refinement of the current page over the real mapped values.
  const filtered = useMemo(() => {
    return allRows.filter((c) => {
      if (empId && !c.empId.toLowerCase().includes(empId.toLowerCase())) return false;
      if (team !== "All" && c.team !== team) return false;
      if (group !== "All" && c.group !== group) return false;
      if (tl !== "All" && c.teamLeader !== tl) return false;
      if (mgr !== "All" && c.manager !== mgr) return false;
      if (from && c.joiningDate < from) return false;
      if (to && c.joiningDate > to) return false;
      return true;
    });
  }, [allRows, empId, team, group, tl, mgr, from, to]);

  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  // The server already paginated; show the refined rows for the current page.
  const pageRows = filtered;

  // Total card uses the API total. Active / Inactive are GLOBAL — counted over
  // the full consultant set, not just the current page. status===1 -> Active,
  // everything else -> Inactive. The users table has no On-Leave field, so that
  // card resolves to 0 rather than being fabricated.
  const counts = useMemo(() => {
    let active = 0,
      inactive = 0;
    for (const c of consultantsAll?.items ?? []) {
      if (Number(c.status) === 1) active++;
      else inactive++;
    }
    return { active, inactive, leave: 0 };
  }, [consultantsAll]);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setEmpId("");
    setTeam("All");
    setGroup("All");
    setTl("All");
    setMgr("All");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Counsellor Management
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Counsellors
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage admission counsellors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setOpenAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Add Counsellor
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Total Counsellors"
          value={apiTotal}
          loading={isLoading}
          active={statusFilter === "All"}
          onClick={() => {
            setStatusFilter("All");
            setPage(1);
          }}
          accent="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={UserCheck}
          label="Active Counsellors"
          value={counts.active}
          loading={isLoading}
          active={statusFilter === "Active"}
          onClick={() => {
            setStatusFilter(statusFilter === "Active" ? "All" : "Active");
            setPage(1);
          }}
          accent="bg-emerald-500/10 text-emerald-600"
          dot="bg-emerald-500"
        />
        <KpiCard
          icon={UserX}
          label="Inactive Counsellors"
          value={counts.inactive}
          loading={isLoading}
          active={statusFilter === "Inactive"}
          onClick={() => {
            setStatusFilter(statusFilter === "Inactive" ? "All" : "Inactive");
            setPage(1);
          }}
          accent="bg-rose-500/10 text-rose-600"
          dot="bg-rose-500"
        />
        <KpiCard
          icon={UserMinus}
          label="On Leave"
          value={counts.leave}
          loading={isLoading}
          active={statusFilter === "On Leave"}
          onClick={() => {
            setStatusFilter(statusFilter === "On Leave" ? "All" : "On Leave");
            setPage(1);
          }}
          accent="bg-amber-500/10 text-amber-600"
          dot="bg-amber-500"
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput
            icon={Search}
            placeholder="Search counsellor"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <FilterInput icon={Hash} placeholder="Employee ID" value={empId} onChange={setEmpId} />
          <FilterSelect value={team} onChange={setTeam} options={["All", ...TEAMS]} placeholder="Team" />
          <FilterSelect value={group} onChange={setGroup} options={["All", ...GROUPS]} placeholder="Group" />
          <FilterSelect value={tl} onChange={setTl} options={["All", ...TEAM_LEADERS]} placeholder="Team Leader" />
          <FilterSelect value={mgr} onChange={setMgr} options={["All", ...MANAGERS]} placeholder="Manager" />
          <FilterSelect
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v as StatusFilter);
              setPage(1);
            }}
            options={["All", "Active", "Inactive", "On Leave"]}
            placeholder="Status"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                className="h-9 pl-9 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="From"
              />
            </div>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                className="h-9 pl-9 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="To"
              />
            </div>
          </div>
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

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {isLoading ? "Loading…" : `${apiTotal.toLocaleString()} counsellors`}
            {statusFilter !== "All" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {statusFilter}
                <button
                  onClick={() => {
                    setStatusFilter("All");
                    setPage(1);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {isFetching && !isLoading && (
              <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground/60 align-text-bottom" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Joining Date</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading counsellors…</div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load counsellors</div>
              <div className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No counsellors found</div>
              <div className="text-xs text-muted-foreground">
                Try adjusting your filters or clearing them.
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[1200px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Employee ID</th>
                  <th className="px-4 py-2.5 font-semibold">Counsellor</th>
                  <th className="px-4 py-2.5 font-semibold">Phone</th>
                  <th className="px-4 py-2.5 font-semibold">Team</th>
                  <th className="px-4 py-2.5 font-semibold">Team Leader</th>
                  <th className="px-4 py-2.5 font-semibold">Group</th>
                  <th className="px-4 py-2.5 font-semibold">Manager</th>
                  <th className="px-4 py-2.5 font-semibold">Active Target</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c, i) => {
                  const pct = Math.min(100, Math.round((c.achieved / c.activeTarget) * 100));
                  return (
                    <tr
                      key={c.empId}
                      className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {c.empId}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{c.phone}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{c.team}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{c.teamLeader}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{c.group}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{c.manager}</td>
                      <td className="px-4 py-3">
                        <div className="flex w-32 flex-col gap-1">
                          <div className="flex items-baseline justify-between text-[11px]">
                            <span className="font-semibold text-foreground">
                              {c.achieved}/{c.activeTarget}
                            </span>
                            <span className="text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
                            STATUS_STYLES[c.status],
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[c.status])} />
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to="/counsellors/profile/$empId"
                            params={{ empId: c.empId }}
                            title="View"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <IconBtn icon={Pencil} label="Edit" />
                          <IconBtn icon={Phone} label="Call" />
                          <IconBtn icon={MessageCircle} label="WhatsApp" />
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
              {apiTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </span>{" "}
            –{" "}
            <span className="font-semibold text-foreground">
              {Math.min(currentPage * PAGE_SIZE, apiTotal)}
            </span>{" "}
            of <span className="font-semibold text-foreground">{apiTotal}</span>
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

      <AddCounsellorDialog open={openAdd} onOpenChange={setOpenAdd} />
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
  active,
  onClick,
  accent,
  dot,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  loading?: boolean;
  active?: boolean;
  onClick?: () => void;
  accent?: string;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border bg-surface p-4 text-left shadow-card transition hover:border-primary/40",
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
      {loading ? (
        <div className="h-7 w-12 animate-pulse rounded bg-muted" />
      ) : (
        <div className="text-2xl font-bold tracking-tight text-foreground">
          {value.toLocaleString()}
        </div>
      )}
    </button>
  );
}

function FilterInput({
  icon: Icon,
  placeholder,
  value,
  onChange,
}: {
  icon: typeof Search;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-9 pl-9 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o === "All" ? `All ${placeholder}s` : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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

function AddCounsellorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Add Counsellor</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Create a new admission counsellor profile.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Profile photo */}
          <div className="flex items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 p-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
              <Camera className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">Profile Photo</div>
              <div className="text-xs text-muted-foreground">PNG or JPG, up to 2 MB.</div>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Employee ID">
              <Input placeholder="UC-1065" />
            </Field>
            <Field label="Designation">
              <Select>
                <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
                <SelectContent>
                  {DESIGNATIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Name">
              <Input placeholder="Full name" />
            </Field>
            <Field label="Email">
              <Input type="email" placeholder="name@upcarrera.com" />
            </Field>

            <Field label="Phone Number">
              <Input placeholder="+91 9xxxxxxxxx" />
            </Field>
            <Field label="Gender">
              <Select>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Date of Birth">
              <Input type="date" />
            </Field>
            <Field label="Joining Date">
              <Input type="date" />
            </Field>

            <Field label="Status">
              <Select defaultValue="Active">
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                  <SelectItem value="On Leave">On Leave</SelectItem>
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
            Create Counsellor
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
