import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api";
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
  ChevronLeft,
  ChevronRight,
  Hash,
  Camera,
  Upload,
  Loader2,
  AlertTriangle,
  MoreHorizontal,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  STATUS_DOT,
  STATUS_STYLES,
  type Counsellor,
  type CounsellorStatus,
} from "@/lib/counsellors-data";
import { useStartCall, type CallHealth } from "@/components/calls/calls-ui";
import { formatPhone, isAcceptablePhoneInput, phoneE164, whatsappHref } from "@/components/counsellors/phone";
import { downloadCsv, toCsv, type CsvColumn } from "@/components/counsellors/export-csv";
import {
  EditCounsellorDialog,
  Field,
  TeamReportsToFields,
  TransferTeamDialog,
  defaultReportsTo,
  useConsultantsList,
  useHierarchyOptions,
  type ConsultantRaw,
} from "@/components/counsellors/counsellor-dialogs";

export const Route = createFileRoute("/counsellors/counsellors")({
  head: () => ({ meta: [{ title: "Counsellors — upCarrera" }] }),
  component: CounsellorsPage,
});

type StatusFilter = CounsellorStatus | "All";

/* ---------------- API → Counsellor mapping ---------------- */

const EMPTY = "—";

/** A consultant is a `users` row (role_id = 6). Only the fields the screen
 *  reads are typed here; the rest of the row is ignored. The raw editable
 *  columns (name, phone, code, employee_code, team_id, reports_to …) come from
 *  ConsultantRaw, which is what the Edit / Transfer dialogs seed from. */
interface ApiConsultant extends ConsultantRaw {
  region?: string | null;
  /** Group -> Team -> Counsellor, resolved server-side by decorateHierarchy. */
  team_leader_name?: string | null;
  group_name?: string | null;
  manager_name?: string | null;
  /** Targets whose window contains today, with achieved (GET /consultants). */
  active_targets?: ApiActiveTarget[];
}

/** One active target as GET /consultants summarises it. type 1 = points, 2 = admissions. */
interface ApiActiveTarget {
  consultant_target_id: number;
  type: number | null;
  value: number | null;
  achieved: number;
}

interface ActiveTargetView {
  id: number;
  unit: string;
  achieved: number;
  value: number;
  /** 0-100, for the bar only; the label shows the real achieved/value. */
  pct: number;
}

function targetUnit(type: number | null): string {
  if (type === 1) return "pts";
  if (type === 2) return "adm";
  return "";
}

function toActiveTargetView(t: ApiActiveTarget): ActiveTargetView {
  const value = t.value ?? 0;
  return {
    id: t.consultant_target_id,
    unit: targetUnit(t.type),
    achieved: t.achieved,
    value,
    pct: value > 0 ? Math.min(100, Math.round((t.achieved / value) * 100)) : 0,
  };
}

/** GET /consultants/groups — counsellors grouped by their users.region value. */
interface CounsellorGroupsResponse {
  items: Array<{ id: string; name: string | null; total_counsellors: number }>;
  total: number;
}

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

/** Legacy users.status is an Int (1 = active). There is no on-leave source. */
function mapStatus(status: number | null | undefined): CounsellorStatus {
  return status === 1 ? "Active" : "Inactive";
}

/** YYYY-MM-DD slice of an ISO date (the mock used a bare date string). */
function asDate(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : "";
}

/** "1 counsellor" / "2 counsellors" — replaces the hardcoded plural suffixes. */
function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

/** Display form of a YYYY-MM-DD joining date; "—" when users.doj is NULL
 *  (true for many legacy rows). */
function formatDate(value: string): string {
  if (!value) return EMPTY;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return EMPTY;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Row number continuous across pages — page 2 starts at 11, not 1. */
function serialNo(page: number, pageSize: number, index: number): number {
  return (page - 1) * pageSize + index + 1;
}

/**
 * A list row. `id` is the real users.id and is what every link and query uses;
 * `empId` is display only. Keeping them apart matters: once employee_code is in
 * use, empId becomes something like "UC-1024" whose digits are NOT a users.id,
 * so routing on the display string would open the wrong person — the same class
 * of bug as the original UC-91 defect.
 */
type CounsellorRow = Omit<Counsellor, "activeTarget" | "achieved"> & {
  id: number;
  /** Real active targets from the server; empty means the counsellor has none. */
  activeTargets: ActiveTargetView[];
  /** The untouched server row. Edit/Transfer seed from this, never from the
   *  display strings above ("—", "+91 98765 43210", "UC-12"). */
  raw: ApiConsultant;
  /** +E.164 when the stored phone can be read confidently, else null. */
  dialPhone: string | null;
  whatsapp: string | null;
};

function mapApiConsultant(c: ApiConsultant): CounsellorRow {
  const gender =
    c.gender === "Female" || c.gender === "Other" ? c.gender : "Male";
  return {
    // users.code is the phone dial code (91 for every Indian user), NOT a per-user
    // identifier — deriving the display id from it gave all 35 counsellors "UC-91"
    // and pointed every View link at the same profile. Prefer the hand-entered
    // employee_code added by migration 001; fall back to the users.id, which is
    // at least unique, for rows that have not been given one yet.
    id: c.id,
    raw: c,
    empId: c.employee_code?.trim() || `UC-${c.id}`,
    name: c.name && c.name.trim() !== "" ? c.name : EMPTY,
    email: asText(c.email),
    // Display only (QA C08): "87146 89444" / "09072238556" read as
    // "+91 87146 89444"; anything that cannot be read confidently is shown as
    // stored rather than guessed at.
    phone: formatPhone(c.phone, c.code, EMPTY),
    dialPhone: phoneE164(c.phone, c.code),
    whatsapp: whatsappHref(c.phone, c.code),
    // Resolved server-side through users.team_id -> sales_team -> counsellor_group
    // (migration 001). These were hardcoded blank, and team/group both showed the
    // free-text users.region, so all four columns read "—" for every counsellor
    // (QA C05). A counsellor in no team still shows "—" — correctly.
    team: asText(c.team_name),
    teamLeader: asText(c.team_leader_name),
    group: asText(c.group_name),
    manager: asText(c.manager_name),
    // Was hard-coded 0/0 for everyone. Now the server's active-target summary
    // (window contains today); an empty list renders "No target".
    activeTargets: (c.active_targets ?? []).map(toActiveTargetView),
    status: mapStatus(c.status),
    joiningDate: asDate(c.doj),
    designation: asText(c.highest_qualification),
    gender,
    dob: asDate(c.dob),
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
  const [editing, setEditing] = useState<ConsultantRaw | null>(null);
  const [transferring, setTransferring] = useState<ConsultantRaw | null>(null);
  const PAGE_SIZE = 10;

  // Live consultants (users where role_id = 6). The list endpoint paginates
  // server-side, so we pull a large page in one shot and let the existing
  // text/id/team/group/status/date filters + paging refine client-side over the
  // real decorated values — identical to how the mock array was consumed.
  const { data, isLoading, isError } = useConsultantsList();

  // Click-to-call, exactly as Student Management does it: only live when the
  // calling integration reports itself configured.
  const { data: callHealth } = useQuery({
    queryKey: ["calls", "health"],
    queryFn: () => apiGet<CallHealth>("/calls/health"),
    staleTime: 5 * 60 * 1000,
  });
  const callsOn = callHealth?.configured ?? false;
  const { callingPhone, start: startCall } = useStartCall();

  // Group options come from the server's own grouping of counsellors (derived
  // from users.region), so the dropdown can only ever offer values that exist.
  // It previously listed North/South/East/West/Central from the prototype file,
  // none of which match any row — so picking one always emptied the table.
  const { data: groupsData } = useQuery({
    queryKey: ["consultants", "groups"],
    queryFn: () => apiGet<CounsellorGroupsResponse>("/consultants/groups"),
    staleTime: 5 * 60 * 1000,
  });


  const allCounsellors = useMemo<CounsellorRow[]>(
    () => ((data?.items ?? []) as ApiConsultant[]).map(mapApiConsultant),
    [data],
  );

  /**
   * Filter options come from the rows on screen, so the list can only offer a
   * value that at least one counsellor actually has. "—" is excluded: it is the
   * placeholder for "not set", not a selectable team.
   */
  const distinct = (pick: (c: CounsellorRow) => string) =>
    [...new Set(allCounsellors.map(pick))].filter((v) => v && v !== EMPTY).sort();

  const teamOptions = useMemo(() => distinct((c) => c.team), [allCounsellors]);
  const leaderOptions = useMemo(() => distinct((c) => c.teamLeader), [allCounsellors]);
  const managerOptions = useMemo(() => distinct((c) => c.manager), [allCounsellors]);
  const groupOptions = useMemo(
    () =>
      [
        ...new Set([
          ...allCounsellors.map((c) => c.group),
          ...(groupsData?.items ?? []).map((g) => g.name ?? ""),
        ]),
      ]
        .filter((v) => v && v !== EMPTY)
        .sort(),
    [allCounsellors, groupsData],
  );

  const filtered = useMemo(() => {
    return allCounsellors.filter((c) => {
      if (statusFilter !== "All" && c.status !== statusFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (empId && !c.empId.toLowerCase().includes(empId.toLowerCase())) return false;
      if (team !== "All" && c.team !== team) return false;
      if (group !== "All" && c.group !== group) return false;
      if (tl !== "All" && c.teamLeader !== tl) return false;
      if (mgr !== "All" && c.manager !== mgr) return false;
      if (from && c.joiningDate < from) return false;
      if (to && c.joiningDate > to) return false;
      return true;
    });
  }, [allCounsellors, statusFilter, search, empId, team, group, tl, mgr, from, to]);

  // The table header claims "Sorted by Joining Date · Newest first" — make that
  // true. GET /consultants has no sort parameter (ListConsultantsDto accepts only
  // page/limit/search/status) and orders by `id desc`, so the sort happens here,
  // over the full set we already hold. Undated rows (users.doj is NULL on many
  // legacy rows) sort last instead of leading the list.
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (a.joiningDate === b.joiningDate) return 0;
        if (!a.joiningDate) return 1;
        if (!b.joiningDate) return -1;
        return a.joiningDate < b.joiningDate ? 1 : -1;
      }),
    [filtered],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // users.status is an Int carrying only 1/0, so mapStatus can never return
  // "On Leave" — an On Leave tile would read 0 forever and its filter would
  // always return an empty table. Both are gone.
  const counts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    allCounsellors.forEach((c) => {
      if (c.status === "Active") active++;
      else inactive++;
    });
    return { active, inactive };
  }, [allCounsellors]);

  // Export the rows the operator is looking at: every filter applied, all
  // pages, in the on-screen order (QA C03).
  const exportCsv = () => {
    if (sorted.length === 0) {
      toast.error("No counsellors match the current filters — nothing to export.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`counsellors-${stamp}.csv`, toCsv(sorted, EXPORT_COLUMNS));
  };

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
          <button
            onClick={exportCsv}
            disabled={isLoading || isError}
            title={`Download the ${pluralize(sorted.length, "filtered counsellor")} as CSV`}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          icon={Users}
          label="Total Counsellors"
          value={allCounsellors.length}
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
          active={statusFilter === "Inactive"}
          onClick={() => {
            setStatusFilter(statusFilter === "Inactive" ? "All" : "Inactive");
            setPage(1);
          }}
          accent="bg-rose-500/10 text-rose-600"
          dot="bg-rose-500"
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput icon={Search} placeholder="Search counsellor" value={search} onChange={setSearch} />
          <FilterInput icon={Hash} placeholder="Employee ID" value={empId} onChange={setEmpId} />
          {/* Every option below is derived from the rows actually fetched, so a
              filter can only ever offer a value that exists. They used to be
              populated from the prototype module (Team Alpha..Echo, Priya Sharma,
              Arjun Rao), none of which matched any row, so picking any of them
              emptied the table (QA C04). They work now because migration 001
              gives counsellors a real team, leader, group and manager. */}
          <FilterSelect
            value={team}
            onChange={setTeam}
            options={["All", ...teamOptions]}
            placeholder="Team"
            allLabel="All Teams"
          />
          <FilterSelect
            value={group}
            onChange={setGroup}
            options={["All", ...groupOptions]}
            placeholder="Group"
            allLabel="All Groups"
          />
          <FilterSelect
            value={tl}
            onChange={setTl}
            options={["All", ...leaderOptions]}
            placeholder="Team Leader"
            allLabel="All Team Leaders"
          />
          <FilterSelect
            value={mgr}
            onChange={setMgr}
            options={["All", ...managerOptions]}
            placeholder="Manager"
            allLabel="All Managers"
          />
          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={["All", "Active", "Inactive"]}
            placeholder="Status"
            allLabel="All Statuses"
          />
          {/* `placeholder` has no effect on a native date input — these rendered
              as two anonymous dd/mm/yyyy boxes. Label them like every other
              control on the page. */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Joined from">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  aria-label="Joined from"
                  className="h-9 pl-9 text-sm"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Joined to">
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  aria-label="Joined to"
                  className="h-9 pl-9 text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </Field>
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
            {pluralize(filtered.length, "counsellor")}
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
            Sorted by <span className="font-medium text-foreground">Joining Date</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading counsellors…</div>
              <div className="text-xs text-muted-foreground">
                Fetching the latest records.
              </div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-rose-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load counsellors</div>
              <div className="text-xs text-muted-foreground">
                Something went wrong. Please try again.
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
            <table className="w-full min-w-[1320px] border-collapse text-sm">
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
                  <th className="px-4 py-2.5 font-semibold">Joining Date</th>
                  <th className="px-4 py-2.5 font-semibold">Active Target</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  {/* Pinned to the right edge (QA C09): at laptop widths the table
                      scrolls horizontally, and the actions used to sit off-screen. */}
                  <th className="sticky right-0 z-10 bg-[color-mix(in_oklab,var(--muted)_60%,var(--surface))] px-4 py-2.5 text-right font-semibold shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.18)]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c, i) => {
                  return (
                    <tr
                      key={c.id}
                      className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                        {serialNo(currentPage, PAGE_SIZE, i)}
                      </td>
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
                      <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatDate(c.joiningDate)}
                      </td>
                      <td className="px-4 py-3">
                        <ActiveTargetCell targets={c.activeTargets} />
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
                      <td className="sticky right-0 bg-surface px-4 py-3 shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.18)] group-hover:bg-[color-mix(in_oklab,var(--muted)_40%,var(--surface))]">
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <Link
                            to="/counsellors/profile/$empId"
                            params={{ empId: String(c.id) }}
                            title="View profile"
                            aria-label={`View ${c.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <IconBtn
                            icon={callingPhone === c.dialPhone && c.dialPhone ? Loader2 : Phone}
                            spin={callingPhone === c.dialPhone && !!c.dialPhone}
                            label={
                              !c.dialPhone
                                ? "No valid phone number on file"
                                : callsOn
                                  ? `Call ${c.phone}`
                                  : "Calling is not configured"
                            }
                            disabled={!c.dialPhone || !callsOn || callingPhone === c.dialPhone}
                            onClick={() => void startCall(c.dialPhone)}
                          />
                          {c.whatsapp ? (
                            <a
                              href={c.whatsapp}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`WhatsApp ${c.phone}`}
                              aria-label={`WhatsApp ${c.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-emerald-600"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          ) : (
                            <IconBtn icon={MessageCircle} label="No valid mobile number on file" disabled />
                          )}
                          {/* Less-used actions live in the overflow menu so the
                              column stays narrow enough to read (QA C09). */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                title="More actions"
                                aria-label={`More actions for ${c.name}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground data-[state=open]:border-border data-[state=open]:bg-background"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onSelect={() => setEditing(c.raw)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setTransferring(c.raw)}>
                                <ArrowRightLeft className="mr-2 h-4 w-4" /> Transfer Team
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
              {filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
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

      <AddCounsellorDialog open={openAdd} onOpenChange={setOpenAdd} />
      <EditCounsellorDialog
        open={editing != null}
        onOpenChange={(v) => !v && setEditing(null)}
        consultant={editing}
      />
      <TransferTeamDialog
        open={transferring != null}
        onOpenChange={(v) => !v && setTransferring(null)}
        consultant={transferring}
      />
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
  icon: typeof Users;
  label: string;
  value: number;
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
      <div className="text-2xl font-bold tracking-tight text-foreground">
        {value.toLocaleString()}
      </div>
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

/** `allLabel` is explicit because the old `All ${placeholder}s` template
 *  produced "All Statuss". */
function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o === "All" ? allLabel : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  spin,
}: {
  icon: typeof Eye;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-transparent"
    >
      <Icon className={cn("h-4 w-4", spin && "animate-spin")} />
    </button>
  );
}

/** CSV columns — display values, the same ones the table shows. */
const EXPORT_COLUMNS: CsvColumn<CounsellorRow>[] = [
  { header: "Employee ID", value: (c) => c.empId },
  { header: "Name", value: (c) => c.name },
  { header: "Email", value: (c) => (c.email === EMPTY ? "" : c.email) },
  { header: "Phone", value: (c) => (c.phone === EMPTY ? "" : c.phone) },
  { header: "Team", value: (c) => (c.team === EMPTY ? "" : c.team) },
  { header: "Team Leader", value: (c) => (c.teamLeader === EMPTY ? "" : c.teamLeader) },
  { header: "Group", value: (c) => (c.group === EMPTY ? "" : c.group) },
  { header: "Manager", value: (c) => (c.manager === EMPTY ? "" : c.manager) },
  { header: "Joining Date", value: (c) => c.joiningDate },
  { header: "Active Target", value: (c) => activeTargetText(c.activeTargets) },
  { header: "Status", value: (c) => c.status },
];

function activeTargetText(targets: ActiveTargetView[]): string {
  return targets.map((t) => `${t.achieved}/${t.value} ${t.unit}`.trim()).join("; ");
}

/** Active Target column: one bar per active target, or an honest "No target". */
function ActiveTargetCell({ targets }: { targets: ActiveTargetView[] }) {
  if (targets.length === 0) {
    return <span className="text-xs text-muted-foreground">No target</span>;
  }
  return (
    <div className="flex w-32 flex-col gap-1.5">
      {targets.map((t) => (
        <div key={t.id} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="font-semibold tabular-nums text-foreground">
              {t.achieved}/{t.value}
              {t.unit && <span className="ml-1 font-normal text-muted-foreground">{t.unit}</span>}
            </span>
            <span className="tabular-nums text-muted-foreground">{t.pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                t.pct >= 80 ? "bg-emerald-500" : t.pct >= 50 ? "bg-amber-500" : "bg-rose-500",
              )}
              style={{ width: `${t.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Add Counsellor ---------------- */

/** The writable half of CreateConsultantDto, plus the team placement that is
 *  saved straight after through PATCH /consultants/:id/team (QA C06).
 *
 *  - Employee Code — optional, users.employee_code (unique; a clash is a 409).
 *    Left blank, the list shows `UC-<users.id>`.
 *  - Team + Reports To — spec 2.1: a counsellor belongs to exactly one team and
 *    reports to someone. Required whenever at least one team exists.
 *
 *  Deliberately absent:
 *  - Designation — the old dropdown was fed by the mock DESIGNATIONS array and
 *    has no column. `highest_qualification` is the real column the list renders
 *    in that slot, so that is what we collect.
 *  - "On Leave" status — users.status is an Int with only 1/0. */
interface CounsellorForm {
  name: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  gender: string;
  dob: string;
  doj: string;
  highest_qualification: string;
  status: "Active" | "Inactive";
  profile_picture: string;
  employee_code: string;
  team_id: string;
  reports_to: string;
}

const EMPTY_FORM: CounsellorForm = {
  name: "",
  username: "",
  password: "",
  email: "",
  phone: "",
  gender: "",
  dob: "",
  doj: "",
  highest_qualification: "",
  status: "Active",
  profile_picture: "",
  employee_code: "",
  team_id: "",
  reports_to: "",
};

const EMPLOYEE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function AddCounsellorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CounsellorForm>(EMPTY_FORM);
  const { teams, people, isLoading: optionsLoading } = useHierarchyOptions();
  const teamById = useMemo(() => new Map(teams.map((t) => [String(t.id), t])), [teams]);
  const hasTeams = teams.length > 0;
  const [photoName, setPhotoName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CounsellorForm>(key: K, value: CounsellorForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Closing always discards the draft, so re-opening starts clean. */
  const close = (next: boolean) => {
    if (!next) {
      setForm(EMPTY_FORM);
      setPhotoName("");
    }
    onOpenChange(next);
  };

  // POST /files/upload — NOT /files/avatar, which writes the *logged-in* user's
  // users.profile_picture and would replace the admin's own photo. /files/upload
  // returns a root-relative storage key we pass through as `profile_picture`.
  const photoMut = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return apiUpload<{ path: string }>("/files/upload", body);
    },
    onSuccess: (res, file) => {
      set("profile_picture", res.path);
      setPhotoName(file.name);
      toast.success("Photo uploaded");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn’t upload the photo"),
  });

  /** Picking a team proposes its leader (or group manager) as Reports To,
   *  unless the operator already chose someone else. */
  const changeTeam = (next: string) => {
    setForm((prev) => {
      const previousDefault = defaultReportsTo(teamById.get(prev.team_id));
      const keepManual =
        prev.reports_to !== "" && prev.reports_to !== String(previousDefault ?? "");
      const proposed = defaultReportsTo(teamById.get(next));
      return {
        ...prev,
        team_id: next,
        reports_to: keepManual ? prev.reports_to : proposed ? String(proposed) : "",
      };
    });
  };

  // Add Counsellor -> POST /consultants, then PATCH /consultants/:id/team. The
  // service forces role_id = 6, bcrypt-hashes the password, normalises the
  // phone, and answers 409 on a duplicate phone/email or employee code — all
  // surfaced rather than swallowed. The two calls are not atomic, so a failed
  // team assignment is reported as exactly that: the counsellor exists, the
  // placement did not save.
  const createMut = useMutation({
    mutationFn: async (input: {
      body: Record<string, unknown>;
      placement: { team_id: number; reports_to: number | null } | null;
    }) => {
      const created = await apiPost<{ id: number }>("/consultants", input.body);
      if (!input.placement) return { created, placementError: null as string | null };
      try {
        await apiPatch(`/consultants/${created.id}/team`, input.placement);
        return { created, placementError: null as string | null };
      } catch (e) {
        return {
          created,
          placementError: e instanceof ApiError ? e.message : "Unknown error",
        };
      }
    },
    onSuccess: ({ placementError }) => {
      qc.invalidateQueries({ queryKey: ["consultants"] });
      qc.invalidateQueries({ queryKey: ["sales-teams"] });
      if (placementError) {
        toast.error(
          `Counsellor created, but the team assignment did not save (${placementError}). Use Transfer Team to place them.`,
        );
      } else {
        toast.success("Counsellor created");
      }
      close(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const name = form.name.trim();
  const username = form.username.trim();
  const employeeCode = form.employee_code.trim();
  const isPending = createMut.isPending || photoMut.isPending;
  const phoneError = !isAcceptablePhoneInput(form.phone)
    ? "Enter a 10-digit Indian mobile (e.g. 98765 43210) or an international number starting with +."
    : null;
  const employeeCodeError =
    employeeCode !== "" && !EMPLOYEE_CODE_PATTERN.test(employeeCode)
      ? "Letters, digits, - _ / only, no spaces."
      : null;
  // Spec 2.1 — team and reports-to are required, but only once a team exists to
  // pick; otherwise the first counsellor could never be created.
  const placementMissing = hasTeams && (form.team_id === "" || form.reports_to === "");
  const canSubmit =
    name !== "" &&
    username !== "" &&
    form.password.length >= MIN_PASSWORD_LENGTH &&
    !phoneError &&
    !employeeCodeError &&
    !placementMissing &&
    !optionsLoading &&
    !isPending;

  const submit = () => {
    if (!canSubmit) return;
    // Send only what CreateConsultantDto accepts; blank optionals are omitted
    // rather than posted as empty strings.
    createMut.mutate({
      placement:
        form.team_id !== ""
          ? {
              team_id: Number(form.team_id),
              reports_to: form.reports_to !== "" ? Number(form.reports_to) : null,
            }
          : null,
      body: {
      name,
      username,
      password: form.password,
      ...(employeeCode ? { employee_code: employeeCode } : {}),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.gender ? { gender: form.gender } : {}),
      ...(form.dob ? { dob: form.dob } : {}),
      ...(form.doj ? { doj: form.doj } : {}),
      ...(form.highest_qualification.trim()
        ? { highest_qualification: form.highest_qualification.trim() }
        : {}),
      ...(form.profile_picture ? { profile_picture: form.profile_picture } : {}),
      status: form.status === "Active" ? 1 : 0,
      },
    });
  };

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after an error
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Profile photo must be a PNG or JPG image");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Profile photo must be 2 MB or smaller");
      return;
    }
    photoMut.mutate(file);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Add Counsellor</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Create a new admission counsellor profile. The username and password
            are the counsellor’s login credentials — share them directly.
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
              <div className="truncate text-xs text-muted-foreground">
                {photoName || "PNG or JPG, up to 2 MB."}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={pickPhoto}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {photoMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {photoMut.isPending ? "Uploading…" : photoName ? "Replace" : "Upload"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input
                placeholder="Full name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Employee Code" error={employeeCodeError}>
              <Input
                placeholder="e.g. UC-1024 (optional)"
                value={form.employee_code}
                onChange={(e) => set("employee_code", e.target.value)}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                placeholder="name@upcarrera.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>

            <Field label="Username" required>
              <Input
                autoComplete="off"
                placeholder="Login username"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
              />
            </Field>
            <Field label="Password" required>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>

            <Field label="Phone Number" error={phoneError}>
              <Input
                placeholder="98765 43210"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Gender">
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Date of Birth">
              <Input
                type="date"
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
              />
            </Field>
            <Field label="Joining Date">
              <Input
                type="date"
                value={form.doj}
                onChange={(e) => set("doj", e.target.value)}
              />
            </Field>

            <Field label="Highest Qualification">
              <Input
                placeholder="e.g. MBA"
                value={form.highest_qualification}
                onChange={(e) => set("highest_qualification", e.target.value)}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as CounsellorForm["status"])}
              >
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

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="text-sm font-semibold text-foreground">Team placement</div>
              <div className="text-xs text-muted-foreground">
                {hasTeams
                  ? "A counsellor belongs to exactly one team and reports to its leader or manager."
                  : optionsLoading
                    ? "Loading teams…"
                    : "No teams exist yet. Create the counsellor now and place them with Transfer Team once a team exists."}
              </div>
            </div>
            <TeamReportsToFields
              teams={teams}
              people={people}
              teamId={form.team_id}
              reportsTo={form.reports_to}
              onTeamChange={changeTeam}
              onReportsToChange={(v) => set("reports_to", v)}
              disabled={isPending}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Leave Employee Code blank to show the system id (UC-&lt;number&gt;).
          </p>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            disabled={createMut.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {createMut.isPending ? "Creating…" : "Create Counsellor"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
