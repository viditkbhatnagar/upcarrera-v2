import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  Download,
  Plus,
  Search,
  Filter,
  RefreshCcw,
  Bookmark,
  Eye,
  Pencil,
  Power,
  X,
  CalendarDays,
  Users2,
  UserCheck,
  UserX,
  Lock,
  ChevronLeft,
  ChevronRight,
  Hash,
  Camera,
  ChevronDown,
  Mail,
  Phone,
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
import { DESIGNATIONS } from "@/lib/counsellors-data";

export const Route = createFileRoute("/administration/users")({
  head: () => ({ meta: [{ title: "User Management — upCarrera" }] }),
  component: UsersPage,
});

type AccountStatus = "Active" | "Inactive" | "Locked";
type StatusFilter = AccountStatus | "All";

interface SystemUser {
  empId: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  status: AccountStatus;
  lastLogin: string; // ISO
  createdAt: string; // YYYY-MM-DD
}

// --- Live API wiring (GET /api/users + /api/roles) -----------------------
// Each list item is a sanitized `users` row (password stripped) from
// PlatformService.findUsers -> { items, total, page, limit }. We map those real
// columns into the screen's existing SystemUser shape. role_id is resolved to a
// human designation via a separate GET /roles ({ id, title }) lookup. The DB has
// no "last login" column, so we surface `updated_at` as the Last Login value.
interface ApiUserRow {
  id: number | string;
  name: string | null;
  code: number | string | null;
  phone: string | null;
  email: string | null;
  username: string | null;
  role_id: number | string | null;
  status: number | string | null; // 1 = active
  region: string | null;
  doj: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface UsersListResponse {
  items: ApiUserRow[];
  total: number;
  page: number;
  limit: number;
}

interface ApiRole {
  id: number | string;
  title: string | null;
}

const EMPTY = "—";

// users.status is an Int (1 = active). The DB models no "Locked" state, so a
// non-active row maps to "Inactive". The Locked KPI/filter stay in the UI but
// resolve to 0 from real data — we do not fabricate a locked status.
function toAccountStatus(status: number | string | null): AccountStatus {
  return Number(status) === 1 ? "Active" : "Inactive";
}

// Employee ID prefers the user's `code`; falls back to the numeric id.
function toEmpId(r: ApiUserRow): string {
  return r.code != null && String(r.code).trim() !== "" ? String(r.code) : String(r.id);
}

function mapToRow(r: ApiUserRow, roleTitles: Map<string, string>): SystemUser {
  const designation =
    r.role_id != null ? (roleTitles.get(String(r.role_id)) ?? EMPTY) : EMPTY;
  return {
    empId: toEmpId(r),
    name: r.name && String(r.name).trim() !== "" ? String(r.name) : EMPTY,
    email: r.email && String(r.email).trim() !== "" ? String(r.email) : EMPTY,
    phone: r.phone != null ? String(r.phone) : EMPTY,
    designation,
    status: toAccountStatus(r.status),
    // No "last login" column in the DB — updated_at is the closest signal.
    lastLogin: r.updated_at ?? r.created_at ?? "",
    // createdAt drives the date-range filter; keep it as a YYYY-MM-DD string.
    createdAt: r.created_at ? String(r.created_at).slice(0, 10) : "",
  };
}

const STATUS_STYLES: Record<AccountStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-slate-500/10 text-slate-700 ring-slate-500/20",
  Locked: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
const STATUS_DOT: Record<AccountStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-slate-500",
  Locked: "bg-rose-500",
};

function formatLastLogin(iso: string) {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UsersPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [empId, setEmpId] = useState("");
  const [designation, setDesignation] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openAdd, setOpenAdd] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 10;

  // Roles lookup (id -> title) for resolving each user's designation. Cached
  // separately so it isn't refetched on every page change.
  const { data: rolesData } = useQuery({
    queryKey: ["roles", "list"],
    queryFn: () => apiGet<ApiRole[]>("/roles"),
    staleTime: 5 * 60 * 1000,
  });

  const roleTitles = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rolesData ?? []) {
      if (r.title && String(r.title).trim() !== "") m.set(String(r.id), String(r.title));
    }
    return m;
  }, [rolesData]);

  // Live users list. The API paginates server-side via page/limit and returns
  // { items, total, page, limit }. Text / empId / designation / status / date
  // filters refine the fetched page client-side over the SAME UI controls.
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["users", "list", { page, limit: PAGE_SIZE }],
    queryFn: () => apiGet<UsersListResponse>("/users", { page, limit: PAGE_SIZE }),
  });

  const apiTotal = data?.total ?? 0;
  const allRows = useMemo(
    () => (data?.items ?? []).map((r) => mapToRow(r, roleTitles)),
    [data, roleTitles],
  );

  // Client-side refinement of the current page over the real mapped values.
  const filtered = useMemo(() => {
    return allRows.filter((u) => {
      if (statusFilter !== "All" && u.status !== statusFilter) return false;
      if (
        search &&
        !u.name.toLowerCase().includes(search.toLowerCase()) &&
        !u.email.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (empId && !u.empId.toLowerCase().includes(empId.toLowerCase())) return false;
      if (designation !== "All" && u.designation !== designation) return false;
      if (from && u.createdAt < from) return false;
      if (to && u.createdAt > to) return false;
      return true;
    });
  }, [allRows, statusFilter, search, empId, designation, from, to]);

  // Server drives pagination; pageRows is the (client-refined) fetched page.
  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered;

  // Total card uses the API total. Active/Inactive/Locked are derived from the
  // fetched page (page-derived) — the DB models no "Locked" state, so that count
  // resolves to 0 from real data rather than being fabricated.
  const counts = useMemo(() => {
    let active = 0,
      inactive = 0,
      locked = 0;
    allRows.forEach((u) => {
      if (u.status === "Active") active++;
      else if (u.status === "Inactive") inactive++;
      else locked++;
    });
    return { active, inactive, locked };
  }, [allRows]);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setEmpId("");
    setDesignation("All");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (pageRows.every((r) => prev.has(r.empId))) {
        const next = new Set(prev);
        pageRows.forEach((r) => next.delete(r.empId));
        return next;
      }
      const next = new Set(prev);
      pageRows.forEach((r) => next.add(r.empId));
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            User Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage system users &amp; login access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenBulk(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Bulk Actions
            <ChevronDown className="h-4 w-4" />
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setOpenAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users2}
          label="Total Users"
          value={apiTotal}
          active={statusFilter === "All"}
          onClick={() => {
            setStatusFilter("All");
            setPage(1);
          }}
          accent="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={UserCheck}
          label="Active Users"
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
          label="Inactive Users"
          value={counts.inactive}
          active={statusFilter === "Inactive"}
          onClick={() => {
            setStatusFilter(statusFilter === "Inactive" ? "All" : "Inactive");
            setPage(1);
          }}
          accent="bg-slate-500/10 text-slate-600"
          dot="bg-slate-500"
        />
        <KpiCard
          icon={Lock}
          label="Locked Accounts"
          value={counts.locked}
          active={statusFilter === "Locked"}
          onClick={() => {
            setStatusFilter(statusFilter === "Locked" ? "All" : "Locked");
            setPage(1);
          }}
          accent="bg-rose-500/10 text-rose-600"
          dot="bg-rose-500"
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Filter className="h-4 w-4 text-muted-foreground" />
            Filters
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Bookmark className="h-3.5 w-3.5" />
              Save View
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
              Apply Filters
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput icon={Search} placeholder="Search user" value={search} onChange={setSearch} />
          <FilterInput icon={Hash} placeholder="Employee ID" value={empId} onChange={setEmpId} />
          <FilterSelect
            value={designation}
            onChange={setDesignation}
            options={["All", ...DESIGNATIONS, "System Administrator", "IT Manager", "HR Administrator"]}
            placeholder="Designation"
          />
          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={["All", "Active", "Inactive", "Locked"]}
            placeholder="Account Status"
          />
          <div className="grid grid-cols-2 gap-2 lg:col-span-2">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                className="h-9 pl-9 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                className="h-9 pl-9 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {isLoading ? "Loading…" : `${apiTotal.toLocaleString()} users`}
            {statusFilter !== "All" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {statusFilter}
                <button onClick={() => setStatusFilter("All")}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {selected.size > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {selected.size} selected
                <button onClick={() => setSelected(new Set())}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {isFetching && !isLoading && (
              <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin text-muted-foreground/60 align-text-bottom" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Created Date</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading users…</div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load users</div>
              <div className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Users2 className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No users found</div>
              <div className="text-xs text-muted-foreground">
                Try adjusting your filters or clearing them.
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.empId))}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-2.5 font-semibold w-12">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Employee ID</th>
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-4 py-2.5 font-semibold">Mobile</th>
                  <th className="px-4 py-2.5 font-semibold">Designation</th>
                  <th className="px-4 py-2.5 font-semibold">Last Login</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u, i) => (
                  <tr
                    key={u.empId}
                    className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-primary"
                        checked={selected.has(u.empId)}
                        onChange={() => toggleSelect(u.empId)}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary">{u.empId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{u.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{u.phone}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{u.designation}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {formatLastLogin(u.lastLogin)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
                          STATUS_STYLES[u.status],
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[u.status])} />
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn icon={Eye} label="View" />
                        <IconBtn icon={Pencil} label="Edit" />
                        <IconBtn
                          icon={Power}
                          label={u.status === "Active" ? "Deactivate" : "Activate"}
                          tone={u.status === "Active" ? "danger" : "success"}
                        />
                      </div>
                    </td>
                  </tr>
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

      <AddUserDialog open={openAdd} onOpenChange={setOpenAdd} />
      <BulkActionsDialog
        open={openBulk}
        onOpenChange={setOpenBulk}
        count={selected.size}
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
  icon: typeof Users2;
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
        "group flex items-center gap-3 rounded-2xl border bg-surface p-4 text-left shadow-card transition hover:shadow-md",
        active ? "border-primary ring-2 ring-primary/20" : "border-border",
      )}
    >
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", accent)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
          {label}
        </div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
          {value.toLocaleString()}
        </div>
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
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function IconBtn({
  icon: Icon,
  label,
  tone = "default",
}: {
  icon: typeof Eye;
  label: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <button
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent transition hover:border-border hover:bg-background",
        tone === "danger" && "text-rose-600 hover:text-rose-700",
        tone === "success" && "text-emerald-600 hover:text-emerald-700",
        tone === "default" && "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/* ---------------- Add User Dialog ---------------- */

function AddUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [status, setStatus] = useState<AccountStatus>("Active");
  const [designation, setDesignation] = useState(DESIGNATIONS[0]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted text-muted-foreground">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                Upload Photo
              </button>
              <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, max 2MB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Employee ID">
              <Input placeholder="UC-1234" />
            </Field>
            <Field label="Name">
              <Input placeholder="Full name" />
            </Field>
            <Field label="Designation">
              <Select value={designation} onValueChange={setDesignation}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    ...DESIGNATIONS,
                    "System Administrator",
                    "IT Manager",
                    "HR Administrator",
                  ].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mobile Number">
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="+91 98765 43210" />
              </div>
            </Field>
            <Field label="Email Address" className="sm:col-span-2">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" type="email" placeholder="user@upcarrera.com" />
              </div>
            </Field>
            <Field label="Account Status" className="sm:col-span-2">
              <div className="flex gap-2">
                {(["Active", "Inactive"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
                      status === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-surface text-foreground hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        s === "Active" ? "bg-emerald-500" : "bg-slate-500",
                      )}
                    />
                    {s}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Create User
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function BulkActionsDialog({
  open,
  onOpenChange,
  count,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Actions</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {count > 0
            ? `Apply an action to ${count} selected user${count === 1 ? "" : "s"}.`
            : "Select users from the table to apply a bulk action."}
        </p>
        <div className="grid gap-2">
          {[
            { label: "Activate Accounts", tone: "success" as const, icon: UserCheck },
            { label: "Deactivate Accounts", tone: "danger" as const, icon: UserX },
            { label: "Unlock Accounts", tone: "default" as const, icon: Lock },
            { label: "Export Selected", tone: "default" as const, icon: Download },
          ].map((a) => (
            <button
              key={a.label}
              disabled={count === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50",
                a.tone === "success" && "hover:text-emerald-700",
                a.tone === "danger" && "hover:text-rose-700",
              )}
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
