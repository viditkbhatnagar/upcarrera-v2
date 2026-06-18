import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Copy,
  Power,
  X,
  CalendarDays,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  Users2,
  Hash,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckSquare,
  Square,
  ChevronRight as ChevronRightIcon,
  Activity,
  UserCheck,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/administration/roles")({
  head: () => ({ meta: [{ title: "Role & Permission Management — upCarrera" }] }),
  component: RolesPage,
});

// ============ Types & data ============

type AccessLevel = "Full Access" | "Limited Access" | "View Only";
type RoleStatus = "Active" | "Inactive" | "System Role";
type StatusFilter = RoleStatus | "All";

const MODULES = [
  "Dashboard",
  "Student Management",
  "Enrollment Management",
  "University Master",
  "Fee Management",
  "Commission Management",
  "Student Support",
  "Reports",
  "Administration",
] as const;
type ModuleName = (typeof MODULES)[number];

const PERMISSION_KEYS = ["view", "create", "edit", "delete", "export", "approve"] as const;
type PermissionKey = (typeof PERMISSION_KEYS)[number];

const PERMISSION_LABEL: Record<PermissionKey, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
  approve: "Approve / Verify",
};

// Which permissions are applicable per module per spec
const MODULE_PERMS: Record<ModuleName, PermissionKey[]> = {
  Dashboard: ["view"],
  "Student Management": ["view", "create", "edit", "delete", "export"],
  "Enrollment Management": ["view", "create", "edit", "export", "approve"],
  "University Master": ["view", "create", "edit", "export", "approve"],
  "Fee Management": ["view", "create", "edit", "export", "approve"],
  "Commission Management": ["view", "create", "edit", "export", "approve"],
  "Student Support": ["view", "create", "edit", "export"],
  Reports: ["view", "export"],
  Administration: ["view", "create", "edit", "delete", "approve"],
};

type PermissionMatrix = Record<ModuleName, Partial<Record<PermissionKey, boolean>>>;

interface Role {
  code: string;
  name: string;
  description: string;
  accessLevel: AccessLevel;
  assignedUsers: number;
  status: RoleStatus;
  lastUpdated: string;
  createdAt: string;
  createdBy: string;
  modifiedBy: string;
  permissions: PermissionMatrix;
  isSystem: boolean;
}

function emptyMatrix(): PermissionMatrix {
  return MODULES.reduce((acc, m) => {
    acc[m] = {};
    return acc;
  }, {} as PermissionMatrix);
}

function fullMatrix(): PermissionMatrix {
  return MODULES.reduce((acc, m) => {
    acc[m] = MODULE_PERMS[m].reduce((p, k) => {
      p[k] = true;
      return p;
    }, {} as Partial<Record<PermissionKey, boolean>>);
    return acc;
  }, {} as PermissionMatrix);
}

// NOTE: the former SEED_ROLES mock array + its view-only/limited matrix helpers
// were removed — this screen now hydrates roles from the live API (see the
// "Live API wiring" block below). `emptyMatrix()`/`fullMatrix()` are retained
// because the Create/Edit role editor still uses them for Clear All / Select All.

const ACCESS_STYLES: Record<AccessLevel, string> = {
  "Full Access": "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  "Limited Access": "bg-amber-500/10 text-amber-700 ring-amber-500/20",
  "View Only": "bg-sky-500/10 text-sky-700 ring-sky-500/20",
};

const STATUS_STYLES: Record<RoleStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-slate-500/10 text-slate-700 ring-slate-500/20",
  "System Role": "bg-violet-500/10 text-violet-700 ring-violet-500/20",
};

const STATUS_DOT: Record<RoleStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-slate-500",
  "System Role": "bg-violet-500",
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============ Live API wiring (GET /api/roles, /permissions, /role-permissions, /users) ============
// The screen's `Role` view-model is rich (matrix, status, audit fields). The legacy
// `user_role` table only stores id/title/created_at/updated_at, so we hydrate the
// rest from sibling endpoints and fall back gracefully where there's no source —
// never inventing data:
//   • permissions matrix  -> derived from /role-permissions slugs (resource/action)
//   • assignedUsers       -> count of /users rows whose role_id === this role id
//   • status / isSystem   -> derived from title (no status column on user_role)
//   • description/createdBy/modifiedBy -> "—" (no API field)

interface ApiRole {
  id: number;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ApiPermission {
  id: number;
  title: string | null;
  slug: string | null;
}

interface ApiRolePermissionLink {
  id: number;
  role_id: number | null;
  permission_id: number | null;
  permission: ApiPermission | null;
}

interface ApiUser {
  id: number;
  role_id: number | null;
}

interface UsersListResponse {
  items: ApiUser[];
  total: number;
  page: number;
  limit: number;
}

const EMPTY = "—";

// permission slug "resource/action" -> our fixed PermissionKey columns.
const ACTION_TO_KEY: Record<string, PermissionKey> = {
  index: "view",
  view: "view",
  show: "view",
  list: "view",
  create: "create",
  add: "create",
  store: "create",
  edit: "edit",
  update: "edit",
  delete: "delete",
  destroy: "delete",
  remove: "delete",
  export: "export",
  download: "export",
  approve: "approve",
  verify: "approve",
};

// permission slug "resource" segment -> one of the screen's fixed modules. Best
// effort: unmatched resources are skipped (no fake checkboxes get drawn).
const RESOURCE_TO_MODULE: Record<string, ModuleName> = {
  dashboard: "Dashboard",
  student: "Student Management",
  students: "Student Management",
  user: "Administration",
  users: "Administration",
  enrollment: "Enrollment Management",
  enrollments: "Enrollment Management",
  application: "Enrollment Management",
  applications: "Enrollment Management",
  admission: "Enrollment Management",
  admissions: "Enrollment Management",
  university: "University Master",
  universities: "University Master",
  course: "University Master",
  courses: "University Master",
  fee: "Fee Management",
  fees: "Fee Management",
  payment: "Fee Management",
  payments: "Fee Management",
  commission: "Commission Management",
  commissions: "Commission Management",
  support: "Student Support",
  ticket: "Student Support",
  tickets: "Student Support",
  report: "Reports",
  reports: "Reports",
  role: "Administration",
  roles: "Administration",
  "roles-permissions": "Administration",
  permission: "Administration",
  permissions: "Administration",
  consultant: "Administration",
  consultants: "Administration",
  setting: "Administration",
  settings: "Administration",
};

// Build the screen's PermissionMatrix from the role's granted permission slugs.
function matrixFromSlugs(slugs: string[]): PermissionMatrix {
  const matrix = emptyMatrix();
  for (const raw of slugs) {
    if (!raw) continue;
    const [resourcePart, actionPart] = String(raw).toLowerCase().split("/");
    const moduleName = RESOURCE_TO_MODULE[resourcePart];
    const key = ACTION_TO_KEY[actionPart ?? "index"];
    if (!moduleName || !key) continue;
    // Only set keys the screen actually renders for that module.
    if (MODULE_PERMS[moduleName].includes(key)) {
      matrix[moduleName] = { ...matrix[moduleName], [key]: true };
    }
  }
  return matrix;
}

// Roles whose granted set is dashboard/view-heavy read as "View Only"; broadly
// granted (create/edit/delete/approve) read as "Full Access"; the rest "Limited".
function accessLevelFromMatrix(matrix: PermissionMatrix): AccessLevel {
  let total = 0;
  let writeish = 0;
  let possible = 0;
  for (const m of MODULES) {
    for (const k of MODULE_PERMS[m]) {
      possible += 1;
      if (matrix[m]?.[k]) {
        total += 1;
        if (k !== "view") writeish += 1;
      }
    }
  }
  if (total === 0) return "View Only";
  if (writeish === 0) return "View Only";
  if (possible > 0 && total / possible >= 0.75) return "Full Access";
  return "Limited Access";
}

// No status column on user_role: treat the seeded super-admin / admin titles as
// system roles, everything else as an Active custom role.
function isSystemRole(role: ApiRole): boolean {
  if (role.id === 1) return true;
  const t = (role.title ?? "").trim().toLowerCase();
  return t === "super admin" || t === "superadmin" || t === "admin" || t === "administrator";
}

function mapApiRole(
  role: ApiRole,
  permsByRole: Map<number, string[]>,
  usersByRole: Map<number, number>,
): Role {
  const slugs = permsByRole.get(role.id) ?? [];
  const matrix = matrixFromSlugs(slugs);
  const system = isSystemRole(role);
  return {
    code: `ROLE-${String(role.id).padStart(4, "0")}`,
    name: role.title && role.title.trim() !== "" ? role.title : EMPTY,
    description: EMPTY,
    accessLevel: accessLevelFromMatrix(matrix),
    assignedUsers: usersByRole.get(role.id) ?? 0,
    status: system ? "System Role" : "Active",
    lastUpdated: role.updated_at ?? role.created_at ?? "",
    createdAt: role.created_at ? String(role.created_at).slice(0, 10) : EMPTY,
    createdBy: EMPTY,
    modifiedBy: EMPTY,
    permissions: matrix,
    isSystem: system,
  };
}

// ============ Page ============

function RolesPage() {
  // --- Live data ---------------------------------------------------------
  // Roles list (bare array), the permission links (role -> slugs) and a user
  // page we count role_id over to fill "Assigned Users". The three run in
  // parallel; roles drive the table while the other two enrich each row.
  const rolesQuery = useQuery({
    queryKey: ["roles", "list"],
    queryFn: () => apiGet<ApiRole[]>("/roles"),
  });
  const rolePermsQuery = useQuery({
    queryKey: ["role-permissions", "all"],
    queryFn: () => apiGet<ApiRolePermissionLink[]>("/role-permissions"),
  });
  const usersQuery = useQuery({
    queryKey: ["users", "for-role-counts"],
    queryFn: () => apiGet<UsersListResponse>("/users", { page: 1, limit: 1000 }),
  });

  const isLoading = rolesQuery.isLoading;
  const isError = rolesQuery.isError;
  const loadError = rolesQuery.error;

  // role_id -> [permission slugs], from the live /role-permissions links.
  const permsByRole = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const link of rolePermsQuery.data ?? []) {
      if (link.role_id == null) continue;
      const slug = link.permission?.slug;
      if (!slug) continue;
      const list = m.get(link.role_id) ?? [];
      list.push(slug);
      m.set(link.role_id, list);
    }
    return m;
  }, [rolePermsQuery.data]);

  // role_id -> assigned user count, from the live /users page.
  const usersByRole = useMemo(() => {
    const m = new Map<number, number>();
    for (const u of usersQuery.data?.items ?? []) {
      if (u.role_id == null) continue;
      m.set(u.role_id, (m.get(u.role_id) ?? 0) + 1);
    }
    return m;
  }, [usersQuery.data]);

  // Mapped, render-ready rows. Recomputed whenever any of the three resolve.
  const liveRoles = useMemo(
    () => (rolesQuery.data ?? []).map((r) => mapApiRole(r, permsByRole, usersByRole)),
    [rolesQuery.data, permsByRole, usersByRole],
  );

  // Local working copy so the in-page editor / duplicate / status toggle keep
  // working (optimistic, client-only). Seeded from the live mapping and kept in
  // sync as the queries resolve.
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => {
    setRoles(liveRoles);
  }, [liveRoles]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter | "Custom" | "System">("All");
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState<string>("All");
  const [minUsers, setMinUsers] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const [openCreate, setOpenCreate] = useState(false);
  const [viewRole, setViewRole] = useState<Role | null>(null);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [dupRole, setDupRole] = useState<Role | null>(null);

  const filtered = useMemo(() => {
    return roles.filter((r) => {
      if (statusFilter === "Custom" && r.isSystem) return false;
      if (statusFilter === "System" && !r.isSystem) return false;
      if (
        statusFilter !== "All" &&
        statusFilter !== "Custom" &&
        statusFilter !== "System" &&
        r.status !== statusFilter
      )
        return false;
      if (
        search &&
        !r.name.toLowerCase().includes(search.toLowerCase()) &&
        !r.code.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (accessFilter !== "All" && r.accessLevel !== accessFilter) return false;
      if (minUsers && r.assignedUsers < Number(minUsers)) return false;
      if (from && r.createdAt < from) return false;
      if (to && r.createdAt > to) return false;
      return true;
    });
  }, [roles, statusFilter, search, accessFilter, minUsers, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const counts = useMemo(() => {
    return {
      total: roles.length,
      active: roles.filter((r) => r.status === "Active").length,
      assignedUsers: roles.reduce((s, r) => s + r.assignedUsers, 0),
      custom: roles.filter((r) => !r.isSystem).length,
      system: roles.filter((r) => r.isSystem).length,
    };
  }, [roles]);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setAccessFilter("All");
    setMinUsers("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const handleSaveRole = (role: Role) => {
    setRoles((prev) => {
      const idx = prev.findIndex((r) => r.code === role.code);
      if (idx === -1) return [role, ...prev];
      const next = [...prev];
      next[idx] = role;
      return next;
    });
  };

  const toggleStatus = (r: Role) => {
    if (r.isSystem) return;
    handleSaveRole({
      ...r,
      status: r.status === "Active" ? "Inactive" : "Active",
      lastUpdated: new Date().toISOString(),
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
            Role &amp; Permission Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage role-based access control for admin portal users.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Create Role
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={ShieldCheck}
          label="Total Roles"
          value={counts.total}
          active={statusFilter === "All"}
          onClick={() => {
            setStatusFilter("All");
            setPage(1);
          }}
          accent="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={Activity}
          label="Active Roles"
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
          icon={UserCheck}
          label="Assigned Users"
          value={counts.assignedUsers}
          active={false}
          onClick={() => {}}
          accent="bg-sky-500/10 text-sky-600"
        />
        <KpiCard
          icon={Sparkles}
          label="Custom Roles"
          value={counts.custom}
          active={statusFilter === "Custom"}
          onClick={() => {
            setStatusFilter(statusFilter === "Custom" ? "All" : "Custom");
            setPage(1);
          }}
          accent="bg-amber-500/10 text-amber-600"
        />
        <KpiCard
          icon={Lock}
          label="System Roles"
          value={counts.system}
          active={statusFilter === "System"}
          onClick={() => {
            setStatusFilter(statusFilter === "System" ? "All" : "System");
            setPage(1);
          }}
          accent="bg-violet-500/10 text-violet-600"
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
              Reset
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
          <FilterInput icon={Search} placeholder="Search role" value={search} onChange={setSearch} />
          <FilterSelect
            value={accessFilter}
            onChange={setAccessFilter}
            options={["All", "Full Access", "Limited Access", "View Only"]}
            placeholder="Access Level"
          />
          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={["All", "Active", "Inactive", "System Role"]}
            placeholder="Status"
          />
          <FilterInput
            icon={Users2}
            placeholder="Min assigned users"
            value={minUsers}
            onChange={setMinUsers}
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
            {isLoading ? "Loading…" : `${filtered.length.toLocaleString()} roles`}
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
            Sorted by <span className="font-medium text-foreground">Last Updated</span> · Newest first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <RefreshCcw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading roles…</div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load roles</div>
              <div className="text-xs text-muted-foreground">
                {loadError instanceof Error ? loadError.message : "Please try again."}
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <ShieldOff className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No roles found</div>
              <div className="text-xs text-muted-foreground">
                Try adjusting your filters or create a new role.
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Role Code</th>
                  <th className="px-4 py-2.5 font-semibold">Role Name</th>
                  <th className="px-4 py-2.5 font-semibold">Description</th>
                  <th className="px-4 py-2.5 font-semibold">Access Level</th>
                  <th className="px-4 py-2.5 font-semibold">Assigned Users</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Last Updated</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr
                    key={r.code}
                    className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewRole(r)}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {r.code}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", ACCESS_STYLES[r.accessLevel])}>
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div className="font-semibold text-foreground">{r.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-[280px]">
                      <div className="line-clamp-2">{r.description}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
                          ACCESS_STYLES[r.accessLevel],
                        )}
                      >
                        {r.accessLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewRole(r)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/80"
                      >
                        <Users2 className="h-3.5 w-3.5" />
                        {r.assignedUsers} Users
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
                          STATUS_STYLES[r.status],
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[r.status])} />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(r.lastUpdated)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn icon={Eye} label="View" onClick={() => setViewRole(r)} />
                        <IconBtn
                          icon={Pencil}
                          label="Edit"
                          onClick={() => setEditRole(r)}
                          disabled={r.isSystem}
                        />
                        <IconBtn icon={Copy} label="Duplicate" onClick={() => setDupRole(r)} />
                        <IconBtn
                          icon={Power}
                          label={r.status === "Active" ? "Deactivate" : "Activate"}
                          onClick={() => toggleStatus(r)}
                          tone={r.status === "Active" ? "danger" : "success"}
                          disabled={r.isSystem}
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
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <div>
            Showing{" "}
            <span className="font-semibold text-foreground">
              {(currentPage - 1) * PAGE_SIZE + 1}-
              {Math.min(currentPage * PAGE_SIZE, filtered.length)}
            </span>{" "}
            of <span className="font-semibold text-foreground">{filtered.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 font-semibold text-foreground">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Create / Edit Drawer */}
      <RoleEditor
        open={openCreate || editRole !== null}
        existing={editRole}
        roles={roles}
        onClose={() => {
          setOpenCreate(false);
          setEditRole(null);
        }}
        onSave={(role) => {
          handleSaveRole(role);
          setOpenCreate(false);
          setEditRole(null);
        }}
      />

      {/* Duplicate */}
      <DuplicateDialog
        role={dupRole}
        existingCodes={roles.map((r) => r.code)}
        onClose={() => setDupRole(null)}
        onSave={(role) => {
          handleSaveRole(role);
          setDupRole(null);
        }}
      />

      {/* View Profile */}
      <RoleProfileDialog
        role={viewRole}
        onClose={() => setViewRole(null)}
        onEdit={(r) => {
          setViewRole(null);
          setEditRole(r);
        }}
        onDuplicate={(r) => {
          setViewRole(null);
          setDupRole(r);
        }}
        onToggle={(r) => {
          toggleStatus(r);
          setViewRole({
            ...r,
            status: r.status === "Active" ? "Inactive" : "Active",
            lastUpdated: new Date().toISOString(),
          });
        }}
      />
    </div>
  );
}

// ============ Subcomponents ============

function KpiCard({
  icon: Icon,
  label,
  value,
  active,
  onClick,
  accent,
  dot,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  accent: string;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md",
        active ? "border-primary ring-1 ring-primary/30" : "border-border",
      )}
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", accent)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
          {label}
        </div>
        <div className="mt-0.5 text-xl font-semibold text-foreground">{value.toLocaleString()}</div>
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
  icon: React.ComponentType<{ className?: string }>;
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
  onClick,
  tone = "default",
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  tone?: "default" | "danger" | "success";
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted hover:text-foreground",
        tone === "danger" && "hover:text-rose-600",
        tone === "success" && "hover:text-emerald-600",
        disabled && "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ============ Permission Matrix ============

function PermissionMatrixGrid({
  matrix,
  onChange,
  readOnly,
}: {
  matrix: PermissionMatrix;
  onChange?: (m: PermissionMatrix) => void;
  readOnly?: boolean;
}) {
  const toggle = (m: ModuleName, k: PermissionKey, val: boolean) => {
    if (readOnly || !onChange) return;
    onChange({ ...matrix, [m]: { ...matrix[m], [k]: val } });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Module</th>
              {PERMISSION_KEYS.map((k) => (
                <th key={k} className="px-3 py-3 text-center font-semibold">
                  {PERMISSION_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m} className="border-t border-border">
                <td className="px-4 py-3 font-semibold text-foreground">{m}</td>
                {PERMISSION_KEYS.map((k) => {
                  const applicable = MODULE_PERMS[m].includes(k);
                  const checked = !!matrix[m]?.[k];
                  return (
                    <td key={k} className="px-3 py-3 text-center">
                      {applicable ? (
                        <Switch
                          checked={checked}
                          onCheckedChange={(v) => toggle(m, k, v)}
                          disabled={readOnly}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Role Editor (Create/Edit) ============

function RoleEditor({
  open,
  existing,
  roles,
  onClose,
  onSave,
}: {
  open: boolean;
  existing: Role | null;
  roles: Role[];
  onClose: () => void;
  onSave: (r: Role) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("Limited Access");
  const [status, setStatus] = useState<RoleStatus>("Active");
  const [matrix, setMatrix] = useState<PermissionMatrix>(emptyMatrix());
  const [copyFrom, setCopyFrom] = useState<string>("");

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep(1);
      if (existing) {
        setName(existing.name);
        setCode(existing.code);
        setDescription(existing.description);
        setAccessLevel(existing.accessLevel);
        setStatus(existing.status === "System Role" ? "Active" : existing.status);
        setMatrix(existing.permissions);
      } else {
        setName("");
        setCode(`ROLE-${String(roles.length + 1).padStart(4, "0")}`);
        setDescription("");
        setAccessLevel("Limited Access");
        setStatus("Active");
        setMatrix(emptyMatrix());
      }
      setCopyFrom("");
    }
  }, [open, existing, roles.length]);

  if (!open) return null;

  const autoGenCode = () => {
    setCode(`ROLE-${String(roles.length + 1).padStart(4, "0")}`);
  };

  const selectAll = () => setMatrix(fullMatrix());
  const clearAll = () => setMatrix(emptyMatrix());
  const copyFromRole = (roleCode: string) => {
    setCopyFrom(roleCode);
    const r = roles.find((x) => x.code === roleCode);
    if (r) setMatrix(JSON.parse(JSON.stringify(r.permissions)));
  };

  const canSave = name.trim().length > 0 && code.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    const base = existing ?? {
      assignedUsers: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      createdBy: "Aditi Khanna",
      isSystem: false,
    };
    onSave({
      ...base,
      code,
      name,
      description,
      accessLevel,
      status,
      lastUpdated: new Date().toISOString(),
      modifiedBy: "Aditi Khanna",
      permissions: matrix,
    } as Role);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-4xl flex-col bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {existing ? "Edit Role" : "Create Role"}
            </div>
            <h2 className="mt-0.5 text-xl font-semibold text-foreground">
              {existing ? existing.name : "New role"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-3">
          <StepPill n={1} label="Role Details" active={step === 1} onClick={() => setStep(1)} />
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
          <StepPill n={2} label="Module Permissions" active={step === 2} onClick={() => setStep(2)} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {step === 1 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Role Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  className="mt-1.5"
                  placeholder="e.g. Finance Executive"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Role Code</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    className="font-mono"
                    placeholder="ROLE-0000"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button
                    onClick={autoGenCode}
                    type="button"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-muted whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Auto
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Access Level</Label>
                <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as AccessLevel)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full Access">Full Access</SelectItem>
                    <SelectItem value="Limited Access">Limited Access</SelectItem>
                    <SelectItem value="View Only">View Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold text-muted-foreground">Description</Label>
                <textarea
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={3}
                  placeholder="Short explanation of this role's purpose"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
                <div className="mt-2 flex items-center gap-3">
                  <Switch
                    checked={status === "Active"}
                    onCheckedChange={(v) => setStatus(v ? "Active" : "Inactive")}
                  />
                  <span className="text-sm font-medium text-foreground">{status}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Module Permissions</h3>
                  <p className="text-xs text-muted-foreground">
                    Configure granular access for every module in a single matrix.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAll}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    <CheckSquare className="h-3.5 w-3.5" /> Select All
                  </button>
                  <button
                    onClick={clearAll}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    <Square className="h-3.5 w-3.5" /> Clear All
                  </button>
                  <Select value={copyFrom} onValueChange={copyFromRole}>
                    <SelectTrigger className="h-8 w-[200px] text-xs">
                      <SelectValue placeholder="Copy from existing role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.code} value={r.code}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <PermissionMatrixGrid matrix={matrix} onChange={setMatrix} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Back
              </button>
            )}
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!canSave}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                Next: Permissions
              </button>
            ) : (
              <button
                onClick={submit}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                {existing ? "Save Changes" : "Create Role"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepPill({
  n,
  label,
  active,
  onClick,
}: {
  n: number;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-primary/10 text-primary ring-1 ring-primary/30"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {n}
      </span>
      {label}
    </button>
  );
}

// ============ Duplicate dialog ============

function DuplicateDialog({
  role,
  existingCodes,
  onClose,
  onSave,
}: {
  role: Role | null;
  existingCodes: string[];
  onClose: () => void;
  onSave: (r: Role) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [copyPerms, setCopyPerms] = useState(true);

  useEffect(() => {
    if (role) {
      setName(`${role.name} (Copy)`);
      setCode(`ROLE-${String(existingCodes.length + 1).padStart(4, "0")}`);
      setCopyPerms(true);
    }
  }, [role, existingCodes.length]);

  if (!role) return null;

  return (
    <Dialog open={!!role} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Role</DialogTitle>
          <DialogDescription>
            Create a new role using <span className="font-semibold">{role.name}</span> as a template.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">New Role Name</Label>
            <Input className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">New Role Code</Label>
            <Input
              className="mt-1.5 font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <Switch checked={copyPerms} onCheckedChange={setCopyPerms} />
            <div>
              <div className="text-sm font-semibold text-foreground">Copy Permissions</div>
              <div className="text-xs text-muted-foreground">
                Carry over the full permission matrix from {role.name}.
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                ...role,
                code,
                name,
                assignedUsers: 0,
                status: "Active",
                isSystem: false,
                createdAt: new Date().toISOString().slice(0, 10),
                createdBy: "Aditi Khanna",
                modifiedBy: "Aditi Khanna",
                lastUpdated: new Date().toISOString(),
                permissions: copyPerms ? JSON.parse(JSON.stringify(role.permissions)) : emptyMatrix(),
              })
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Role Profile ============

function RoleProfileDialog({
  role,
  onClose,
  onEdit,
  onDuplicate,
  onToggle,
}: {
  role: Role | null;
  onClose: () => void;
  onEdit: (r: Role) => void;
  onDuplicate: (r: Role) => void;
  onToggle: (r: Role) => void;
}) {
  // Live assigned users for this role. role.code is "ROLE-####"; the trailing
  // digits are the real user_role.id, which is what /users filters on.
  const roleId = role ? Number(role.code.replace(/[^0-9]/g, "")) : undefined;
  const assignedQuery = useQuery({
    enabled: !!role && Number.isFinite(roleId),
    queryKey: ["users", "by-role", roleId],
    queryFn: () => apiGet<UsersListResponse>("/users", { role_id: roleId, page: 1, limit: 100 }),
  });

  if (!role) return null;

  // Map real users into the existing assigned-users row shape. Department and
  // Designation have no column on the users table -> graceful "—".
  const assignedUsers = (assignedQuery.data?.items ?? []).map((u) => {
    const anyU = u as ApiUser & {
      name?: string | null;
      email?: string | null;
      code?: number | null;
      status?: number | null;
    };
    return {
      empId:
        anyU.code != null && anyU.code !== 0 ? `EMP-${anyU.code}` : `USR-${u.id}`,
      name: anyU.name && anyU.name.trim() !== "" ? anyU.name : "—",
      department: "—",
      designation: "—",
      email: anyU.email && anyU.email.trim() !== "" ? anyU.email : "—",
      status: anyU.status === 1 || anyU.status == null ? "Active" : "Inactive",
    };
  });

  const timeline = [
    { title: "Role Created", when: role.createdAt, by: role.createdBy, desc: `Role ${role.name} created.` },
    {
      title: "Permission Updated",
      when: role.lastUpdated,
      by: role.modifiedBy,
      desc: "Permission matrix updated.",
    },
    {
      title: role.status === "Active" ? "Role Activated" : "Role Deactivated",
      when: role.lastUpdated,
      by: role.modifiedBy,
      desc: `Status set to ${role.status}.`,
    },
    {
      title: "User Assigned",
      when: role.lastUpdated,
      by: role.modifiedBy,
      desc: `${role.assignedUsers} users currently assigned.`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-5xl flex-col bg-background shadow-2xl">
        {/* Header */}
        <div className="border-b border-border bg-gradient-to-br from-primary/5 to-transparent px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-2xl",
                  ACCESS_STYLES[role.accessLevel],
                )}
              >
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    {role.name}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                      STATUS_STYLES[role.status],
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[role.status])} />
                    {role.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-primary">{role.code}</span>
                  <span>·</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset",
                      ACCESS_STYLES[role.accessLevel],
                    )}
                  >
                    {role.accessLevel}
                  </span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Users2 className="h-3.5 w-3.5" />
                    {role.assignedUsers} assigned users
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(role)}
                disabled={role.isSystem}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Role
              </button>
              <button
                onClick={() => onDuplicate(role)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </button>
              <button
                onClick={() => onToggle(role)}
                disabled={role.isSystem}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40",
                  role.status === "Active"
                    ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                )}
              >
                <Power className="h-3.5 w-3.5" />
                {role.status === "Active" ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border px-6">
            <TabsList className="h-10 bg-transparent p-0">
              <TabsTrigger value="overview" className="data-[state=active]:bg-muted">
                Overview
              </TabsTrigger>
              <TabsTrigger value="permissions" className="data-[state=active]:bg-muted">
                Permissions
              </TabsTrigger>
              <TabsTrigger value="users" className="data-[state=active]:bg-muted">
                Assigned Users ({role.assignedUsers})
              </TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-muted">
                Activity Timeline
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Role Name" value={role.name} />
                <Field label="Role Code" value={role.code} mono />
                <Field label="Access Level" value={role.accessLevel} />
                <Field label="Status" value={role.status} />
                <Field label="Created Date" value={role.createdAt} />
                <Field label="Created By" value={role.createdBy} />
                <Field label="Last Modified Date" value={formatDate(role.lastUpdated)} />
                <Field label="Last Modified By" value={role.modifiedBy} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Description</Label>
                <div className="mt-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">
                  {role.description || "—"}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="permissions" className="mt-0">
              <PermissionMatrixGrid matrix={role.permissions} readOnly />
            </TabsContent>

            <TabsContent value="users" className="mt-0">
              {assignedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
                  <Users2 className="h-8 w-8 text-muted-foreground/40" />
                  <div className="text-sm font-semibold text-foreground">No users assigned</div>
                  <div className="text-xs text-muted-foreground">
                    Assign users to this role from the User Management module.
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full min-w-[800px] border-collapse text-sm">
                    <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Employee ID</th>
                        <th className="px-4 py-2.5 font-semibold">Name</th>
                        <th className="px-4 py-2.5 font-semibold">Department</th>
                        <th className="px-4 py-2.5 font-semibold">Designation</th>
                        <th className="px-4 py-2.5 font-semibold">Email</th>
                        <th className="px-4 py-2.5 font-semibold">Status</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedUsers.map((u) => (
                        <tr key={u.empId} className="border-t border-border hover:bg-muted/40">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">
                            {u.empId}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-foreground">{u.name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{u.department}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{u.designation}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                u.status === "Active"
                                  ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                                  : "bg-slate-500/10 text-slate-700 ring-slate-500/20",
                              )}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-1">
                              <IconBtn icon={Eye} label="View User" />
                              <IconBtn icon={ShieldAlert} label="Change Role" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <ol className="relative space-y-4 border-l border-border pl-6">
                {timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[29px] top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 ring-4 ring-background">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    <div className="rounded-lg border border-border bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-foreground">{t.title}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(t.when)}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t.desc} · by{" "}
                        <span className="font-medium text-foreground">{t.by}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold text-foreground",
          mono && "font-mono text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}
