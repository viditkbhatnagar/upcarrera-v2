import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { ALL_COUNSELLORS, DESIGNATIONS } from "@/lib/counsellors-data";

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

const ADMIN_USERS: SystemUser[] = [
  {
    empId: "UC-ADM-001",
    name: "Aditi Khanna",
    email: "aditi.khanna@upcarrera.com",
    phone: "+91 9810000001",
    designation: "System Administrator",
    status: "Active",
    lastLogin: "2026-06-17T09:14:00",
    createdAt: "2022-01-12",
  },
  {
    empId: "UC-ADM-002",
    name: "Rahul Bhatia",
    email: "rahul.bhatia@upcarrera.com",
    phone: "+91 9810000002",
    designation: "IT Manager",
    status: "Active",
    lastLogin: "2026-06-16T18:42:00",
    createdAt: "2022-03-05",
  },
  {
    empId: "UC-ADM-003",
    name: "Meera Iyer",
    email: "meera.iyer@upcarrera.com",
    phone: "+91 9810000003",
    designation: "HR Administrator",
    status: "Locked",
    lastLogin: "2026-05-30T11:02:00",
    createdAt: "2022-06-20",
  },
];

const ALL_USERS: SystemUser[] = [
  ...ADMIN_USERS,
  ...ALL_COUNSELLORS.map<SystemUser>((c, i) => {
    const status: AccountStatus =
      c.status === "Active"
        ? i % 17 === 0
          ? "Locked"
          : "Active"
        : "Inactive";
    const daysAgo = (i * 11) % 45;
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(8 + (i % 10), (i * 7) % 60, 0, 0);
    return {
      empId: c.empId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      designation: c.designation,
      status,
      lastLogin: d.toISOString(),
      createdAt: c.joiningDate,
    };
  }),
];

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
  const d = new Date(iso);
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

  const filtered = useMemo(() => {
    return ALL_USERS.filter((u) => {
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
  }, [statusFilter, search, empId, designation, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const counts = useMemo(() => {
    let active = 0,
      inactive = 0,
      locked = 0;
    ALL_USERS.forEach((u) => {
      if (u.status === "Active") active++;
      else if (u.status === "Inactive") inactive++;
      else locked++;
    });
    return { active, inactive, locked };
  }, []);

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
          value={ALL_USERS.length}
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
            {filtered.length.toLocaleString()} users
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
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Created Date</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {pageRows.length === 0 ? (
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
