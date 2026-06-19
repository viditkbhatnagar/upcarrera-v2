import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bookmark,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  Hash,
  Key,
  Monitor,
  RefreshCcw,
  Search,
  Shield,
  ShieldAlert,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export const Route = createFileRoute("/administration/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — upCarrera" }] }),
  component: AuditLogsPage,
});

/* ---------------- Types ---------------- */

type AuditCategory =
  | "User"
  | "Student"
  | "Admission"
  | "Finance"
  | "Security"
  | "Permission"
  | "University"
  | "Counsellor";

type AuditStatus = "Success" | "Failed" | "Warning" | "Critical";

type ModuleName =
  | "Applications"
  | "Students"
  | "Finance"
  | "University Master"
  | "User Management"
  | "Role & Permission"
  | "Counsellor Management"
  | "Reports"
  | "Security";

type Department =
  | "Admissions"
  | "Student Support"
  | "Finance"
  | "Operations"
  | "Administration";

interface AuditLog {
  id: string;
  timestamp: string; // ISO
  userName: string;
  userEmail: string;
  empId: string;
  designation: string;
  department: Department;
  module: ModuleName;
  recordId: string;
  action: string;
  oldValue: string;
  newValue: string;
  field: string;
  ipAddress: string;
  browser: string;
  device: string;
  location: string;
  sessionId: string;
  status: AuditStatus;
  category: AuditCategory;
}

/* ---------------- Mock data generator ---------------- */

const MODULES: ModuleName[] = [
  "Applications",
  "Students",
  "Finance",
  "University Master",
  "User Management",
  "Role & Permission",
  "Counsellor Management",
  "Reports",
  "Security",
];

// Audit logging is not implemented in the backend — there is no audit table or
// API endpoint in this system. We intentionally ship an honest empty state
// instead of fabricated rows. When an audit backend exists, replace this with a
// useQuery against the real endpoint.
const ALL_LOGS: AuditLog[] = [];

/* ---------------- Status styles ---------------- */

const STATUS_STYLES: Record<AuditStatus, string> = {
  Success: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Failed: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
  Warning: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
  Critical: "bg-red-600/10 text-red-700 ring-red-600/30",
};
const STATUS_DOT: Record<AuditStatus, string> = {
  Success: "bg-emerald-500",
  Failed: "bg-rose-500",
  Warning: "bg-amber-500",
  Critical: "bg-red-600",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = months[d.getUTCMonth()];
  const yy = d.getUTCFullYear();
  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return {
    date: `${dd} ${mm} ${yy}`,
    time: `${String(h).padStart(2, "0")}:${m} ${ampm}`,
  };
}

/* ---------------- Page ---------------- */

type TabKey = "All" | AuditCategory;
const TAB_LABELS: Record<TabKey, string> = {
  All: "All Activities",
  User: "User Activities",
  Student: "Student Activities",
  Admission: "Admission Activities",
  Finance: "Finance Activities",
  Security: "Security Activities",
  Permission: "Permission Changes",
  University: "University",
  Counsellor: "Counsellor",
};

function AuditLogsPage() {
  const [tab, setTab] = useState<TabKey>("All");
  const [search, setSearch] = useState("");
  const [recordId, setRecordId] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("All");
  const [deptFilter, setDeptFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | AuditStatus>("All");
  const [ipFilter, setIpFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const PAGE_SIZE = 12;

  const filtered = useMemo(() => {
    return ALL_LOGS.filter((l) => {
      if (tab !== "All" && l.category !== tab) return false;
      if (statusFilter !== "All" && l.status !== statusFilter) return false;
      if (moduleFilter !== "All" && l.module !== moduleFilter) return false;
      if (actionFilter !== "All" && l.action !== actionFilter) return false;
      if (deptFilter !== "All" && l.department !== deptFilter) return false;
      if (ipFilter && !l.ipAddress.includes(ipFilter)) return false;
      if (recordId && !l.recordId.toLowerCase().includes(recordId.toLowerCase())) return false;
      if (
        search &&
        !l.userName.toLowerCase().includes(search.toLowerCase()) &&
        !l.userEmail.toLowerCase().includes(search.toLowerCase()) &&
        !l.empId.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      const day = l.timestamp.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [tab, statusFilter, moduleFilter, actionFilter, deptFilter, ipFilter, recordId, search, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const kpi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let totalToday = 0;
    let security = 0;
    let finance = 0;
    let permission = 0;
    let failedLogins = 0;
    ALL_LOGS.forEach((l) => {
      if (l.timestamp.slice(0, 10) === today) totalToday++;
      if (l.category === "Security") security++;
      if (l.category === "Finance") finance++;
      if (l.category === "Permission") permission++;
      if (l.action === "Failed Login") failedLogins++;
    });
    return { totalToday, security, finance, permission, failedLogins };
  }, []);

  const resetFilters = () => {
    setSearch("");
    setRecordId("");
    setModuleFilter("All");
    setActionFilter("All");
    setDeptFilter("All");
    setStatusFilter("All");
    setIpFilter("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const ALL_ACTIONS = useMemo(() => {
    const s = new Set<string>();
    ALL_LOGS.forEach((l) => s.add(l.action));
    return ["All", ...Array.from(s).sort()];
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Audit Logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track system activities, user actions and security events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Export Logs
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover">
            <FileText className="h-4 w-4" />
            Download Report
          </button>
        </div>
      </div>

      {/* Honest notice: no audit backend exists */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-800">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">Audit logging isn&apos;t enabled yet</div>
          <p className="mt-0.5 text-xs text-amber-800/90">
            This system has no audit trail backend, so there is no activity to display. The
            filters and counters below stay at zero until audit logging is enabled.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          icon={Activity}
          label="Total Activities"
          value={ALL_LOGS.length}
          trend="+12%"
          accent="bg-primary/10 text-primary"
          active={tab === "All"}
          onClick={() => {
            setTab("All");
            setPage(1);
          }}
        />
        <KpiCard
          icon={TrendingUp}
          label="Today's Activities"
          value={kpi.totalToday}
          trend="+5%"
          accent="bg-sky-500/10 text-sky-600"
        />
        <KpiCard
          icon={ShieldAlert}
          label="Security Events"
          value={kpi.security}
          trend="-3%"
          accent="bg-rose-500/10 text-rose-600"
          active={tab === "Security"}
          onClick={() => {
            setTab(tab === "Security" ? "All" : "Security");
            setPage(1);
          }}
        />
        <KpiCard
          icon={Wallet}
          label="Finance Changes"
          value={kpi.finance}
          trend="+8%"
          accent="bg-amber-500/10 text-amber-600"
          active={tab === "Finance"}
          onClick={() => {
            setTab(tab === "Finance" ? "All" : "Finance");
            setPage(1);
          }}
        />
        <KpiCard
          icon={Shield}
          label="Permission Changes"
          value={kpi.permission}
          trend="+2%"
          accent="bg-violet-500/10 text-violet-600"
          active={tab === "Permission"}
          onClick={() => {
            setTab(tab === "Permission" ? "All" : "Permission");
            setPage(1);
          }}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Failed Logins"
          value={kpi.failedLogins}
          trend="-1%"
          accent="bg-red-600/10 text-red-600"
          active={statusFilter === "Failed"}
          onClick={() => {
            setStatusFilter(statusFilter === "Failed" ? "All" : "Failed");
            setPage(1);
          }}
        />
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
        {(["All", "User", "Student", "Admission", "Finance", "Security", "Permission"] as TabKey[]).map(
          (t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={cn(
                "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                tab === t
                  ? "bg-primary text-primary-foreground shadow-card"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ),
        )}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Filter className="h-4 w-4 text-muted-foreground" />
            Filters
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
              <Download className="h-3.5 w-3.5" />
              Export Results
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover">
              Apply Filters
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <FilterInput icon={Search} placeholder="Search user" value={search} onChange={setSearch} />
          <FilterInput icon={Hash} placeholder="Record ID" value={recordId} onChange={setRecordId} />
          <FilterSelect
            value={moduleFilter}
            onChange={setModuleFilter}
            options={["All", ...MODULES]}
            placeholder="Module"
          />
          <FilterSelect
            value={actionFilter}
            onChange={setActionFilter}
            options={ALL_ACTIONS}
            placeholder="Action Type"
          />
          <FilterSelect
            value={deptFilter}
            onChange={setDeptFilter}
            options={["All", "Admissions", "Student Support", "Finance", "Operations", "Administration"]}
            placeholder="Department"
          />
          <FilterInput icon={Monitor} placeholder="IP Address" value={ipFilter} onChange={setIpFilter} />
          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as "All" | AuditStatus)}
            options={["All", "Success", "Failed", "Warning", "Critical"]}
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
            {filtered.length.toLocaleString()} activities
            {tab !== "All" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {TAB_LABELS[tab]}
                <button onClick={() => setTab("All")}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
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
            Sorted by <span className="font-medium text-foreground">Date & Time</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {pageRows.length === 0 ? (
            <EmptyState />
          ) : (
            <table className="w-full min-w-[1400px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Date & Time</th>
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-4 py-2.5 font-semibold">Department</th>
                  <th className="px-4 py-2.5 font-semibold">Module</th>
                  <th className="px-4 py-2.5 font-semibold">Record ID</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Old Value</th>
                  <th className="px-4 py-2.5 font-semibold">New Value</th>
                  <th className="px-4 py-2.5 font-semibold">IP Address</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((l, idx) => {
                  const dt = formatDateTime(l.timestamp);
                  return (
                    <tr
                      key={l.id}
                      className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground">{dt.date}</div>
                        <div className="text-xs text-muted-foreground">{dt.time}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {l.userName
                              .split(" ")
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {l.userName}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{l.designation}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                        {l.department}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{l.module}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button className="font-mono text-xs font-semibold text-primary hover:underline">
                          {l.recordId}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">
                        {l.action}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {l.oldValue}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                        {l.newValue}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {l.ipAddress}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
                            STATUS_STYLES[l.status],
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[l.status])} />
                          {l.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => setSelectedLog(l)}
                            title="View Details"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
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

      <AuditDetailsDrawer log={selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)} />
    </div>
  );
}

/* ---------------- Empty state ---------------- */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Activity className="h-7 w-7 text-muted-foreground/60" />
      </div>
      <div className="text-sm font-semibold text-foreground">
        Audit logging isn&apos;t enabled yet
      </div>
      <div className="max-w-sm text-xs text-muted-foreground">
        There is no audit trail backend connected to this system, so there is no activity to
        display. Once audit logging is enabled, recorded actions will appear here automatically.
      </div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  accent,
  active,
  onClick,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  trend?: string;
  accent?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const trendUp = trend?.startsWith("+");
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
        <div className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {value.toLocaleString()}
          </div>
          {trend && (
            <span
              className={cn(
                "text-[11px] font-semibold",
                trendUp ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {trend}
            </span>
          )}
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

/* ---------------- Details Drawer ---------------- */

function AuditDetailsDrawer({
  log,
  onOpenChange,
}: {
  log: AuditLog | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!log;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {log && (
          <>
            <SheetHeader className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-primary">{log.id}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                    STATUS_STYLES[log.status],
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[log.status])} />
                  {log.status}
                </span>
              </div>
              <SheetTitle className="text-lg">{log.action}</SheetTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{formatDateTime(log.timestamp).date}</span>
                <span>•</span>
                <span>{formatDateTime(log.timestamp).time}</span>
                <span>•</span>
                <span className="font-medium text-foreground">{log.module}</span>
              </div>
            </SheetHeader>

            <div className="space-y-5 py-4">
              <Section title="Activity Summary">
                <Detail label="User" value={`${log.userName} (${log.empId})`} />
                <Detail label="Department" value={log.department} />
                <Detail label="Module" value={log.module} />
                <Detail label="Record ID" value={log.recordId} mono />
                <Detail label="Action" value={log.action} />
                <Detail
                  label="Date & Time"
                  value={`${formatDateTime(log.timestamp).date} • ${formatDateTime(log.timestamp).time}`}
                />
              </Section>

              <Section title="Change Details">
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Field</th>
                        <th className="px-3 py-2 font-semibold">Old Value</th>
                        <th className="px-3 py-2 font-semibold">New Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{log.field}</td>
                        <td className="px-3 py-2 text-muted-foreground">{log.oldValue}</td>
                        <td className="px-3 py-2 text-foreground">{log.newValue}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Technical Information">
                <Detail label="IP Address" value={log.ipAddress} mono />
                <Detail label="Browser" value={log.browser} />
                <Detail label="Device" value={log.device} />
                <Detail label="Session ID" value={log.sessionId} mono />
                <Detail label="Location" value={log.location} />
              </Section>

              <Section title="Related Record">
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {log.module} Record
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{log.recordId}</div>
                    </div>
                    <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                      <Eye className="h-3.5 w-3.5" />
                      View Record
                    </button>
                  </div>
                </div>
              </Section>

              <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800">
                <Key className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Audit logs are immutable. This record cannot be edited or deleted and is retained
                  for compliance review.
                </span>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-right text-sm font-medium text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </div>
    </div>
  );
}
