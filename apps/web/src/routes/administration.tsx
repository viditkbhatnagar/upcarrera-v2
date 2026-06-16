import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Hash,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/administration")({
  head: () => ({ meta: [{ title: "Administration — upCarrera" }] }),
  component: AdministrationPage,
});

// --- Live API wiring -------------------------------------------------------
// Three live sources back this screen, all behind the staff JwtAuthGuard:
//   GET /api/users     -> Paginated { items, total, page, limit } (role_id filter)
//   GET /api/roles     -> user_role[] { id, title, ... }
//   GET /api/settings  -> Record<item, value | null>
// The roles list is fetched once and reused both as the user role-filter source
// and to resolve each user's role_id into a human title — no hardcoded maps.

interface ApiUserRow {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  code: number | null;
  username: string | null;
  region: string | null;
  role_id: number | null;
  status: number | null;
  profile_picture: string | null;
  created_at: string | null;
}

interface UsersListResponse {
  items: ApiUserRow[];
  total: number;
  page: number;
  limit: number;
}

interface ApiRole {
  id: number;
  title: string | null;
  created_at: string | null;
}

type SettingsMap = Record<string, string | null>;

const EMPTY = "—";
const PAGE_SIZE = 12;

function asText(value: string | number | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// users.status (legacy Int) -> label. 1 = active is the schema default.
function statusLabel(status: number | null): "Active" | "Inactive" {
  return status === 1 ? "Active" : "Inactive";
}

// Humanise a settings item key ("ios_register" -> "Ios Register").
function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function AdministrationPage() {
  // Roles power both the Roles tab and the Users role filter / labels. Fetched
  // once and shared.
  const rolesQuery = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: () => apiGet<ApiRole[]>("/roles"),
  });

  const roleById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rolesQuery.data ?? []) {
      m.set(r.id, asText(r.title));
    }
    return m;
  }, [rolesQuery.data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            System Administration
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Administration
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage platform users, roles &amp; permissions, and system settings.
          </p>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-5">
        <TabsList className="h-auto flex-wrap gap-1 bg-muted/60 p-1">
          <TabsTrigger value="users" className="gap-1.5 px-3.5 py-1.5 text-sm">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5 px-3.5 py-1.5 text-sm">
            <Shield className="h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 px-3.5 py-1.5 text-sm">
            <SettingsIcon className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-0 space-y-5">
          <UsersTab roleById={roleById} roles={rolesQuery.data ?? []} rolesLoading={rolesQuery.isLoading} />
        </TabsContent>

        <TabsContent value="roles" className="mt-0 space-y-5">
          <RolesTab
            roles={rolesQuery.data ?? []}
            isLoading={rolesQuery.isLoading}
            isError={rolesQuery.isError}
            error={rolesQuery.error}
            refetch={() => rolesQuery.refetch()}
            isFetching={rolesQuery.isFetching}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-0 space-y-5">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ Users tab ============================ */

function UsersTab({
  roleById,
  roles,
  rolesLoading,
}: {
  roleById: Map<number, string>;
  roles: ApiRole[];
  rolesLoading: boolean;
}) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [roleId, setRoleId] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Write-flow state: a single dialog handles both create and edit; `editing`
  // null = create mode. `deleting` holds the row queued for soft-delete.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiUserRow | null>(null);
  const [deleting, setDeleting] = useState<ApiUserRow | null>(null);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["admin", "users", { page, limit: PAGE_SIZE, roleId }],
    queryFn: () =>
      apiGet<UsersListResponse>("/users", {
        page,
        limit: PAGE_SIZE,
        role_id: roleId === "all" ? undefined : roleId,
      }),
  });

  // Refresh every users page (any page/limit/roleId) after a write.
  const invalidateUsers = () =>
    qc.invalidateQueries({ queryKey: ["admin", "users"] });

  const createMut = useMutation({
    mutationFn: (body: UserWriteBody) => apiPost("/users", body),
    onSuccess: () => {
      invalidateUsers();
      toast.success("User created");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UserWriteBody }) =>
      apiPatch(`/users/${id}`, body),
    onSuccess: () => {
      invalidateUsers();
      toast.success("User updated");
      setFormOpen(false);
      setEditing(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/users/${id}`),
    onSuccess: () => {
      invalidateUsers();
      toast.success("User deleted");
      setDeleting(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Something went wrong"),
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (row: ApiUserRow) => {
    setEditing(row);
    setFormOpen(true);
  };

  const apiTotal = data?.total ?? 0;
  const rows = data?.items ?? [];

  // Text search refines the fetched page client-side over the real joined values.
  const pageRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) =>
      `${u.name ?? ""} ${u.email ?? ""} ${u.username ?? ""} ${u.phone ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  return (
    <>
      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Filter className="h-4 w-4 text-muted-foreground" />
            Filters
          </div>
          <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New User
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="Name, email, username or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={roleId}
            onValueChange={(v) => {
              setRoleId(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {asText(r.title)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={() => {
              setRoleId("all");
              setSearch("");
              setPage(1);
            }}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Reset filters
          </button>
        </div>
        {rolesLoading && (
          <div className="mt-2 text-xs text-muted-foreground">Loading role filter…</div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {isLoading ? "Loading…" : `${apiTotal.toLocaleString()} users`}
            {roleId !== "all" && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                {roleById.get(Number(roleId)) ?? `Role #${roleId}`}
              </span>
            )}
            {isFetching && !isLoading && (
              <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin align-text-bottom text-muted-foreground/60" />
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by <span className="font-medium text-foreground">Newest</span> first
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <StateBlock
              icon={RefreshCcw}
              spin
              title="Loading users…"
              tone="muted"
            />
          ) : isError ? (
            <StateBlock
              icon={AlertTriangle}
              tone="error"
              title="Couldn’t load users"
              subtitle={error instanceof Error ? error.message : "Please try again."}
              action={{ label: "Retry", onClick: () => refetch() }}
            />
          ) : pageRows.length === 0 ? (
            <StateBlock
              icon={Users}
              tone="muted"
              title="No users found"
              subtitle="Try adjusting your filters or clearing them."
            />
          ) : (
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-4 py-2.5 font-semibold">Contact</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Region</th>
                  <th className="px-4 py-2.5 font-semibold">Joined</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u) => {
                  const name = asText(u.name);
                  const role =
                    u.role_id != null ? roleById.get(u.role_id) ?? `Role #${u.role_id}` : EMPTY;
                  const status = statusLabel(u.status);
                  return (
                    <tr
                      key={u.id}
                      className="group border-b border-border transition last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={name} src={u.profile_picture} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {name}
                            </div>
                            <div className="truncate font-mono text-xs text-muted-foreground">
                              {u.username ? u.username : `#${u.id}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs text-foreground">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {asText(u.email)}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {asText(u.phone)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary ring-1 ring-inset ring-primary/20">
                          <Shield className="h-3 w-3" />
                          {role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{asText(u.region)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
                            status === "Active"
                              ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground ring-border",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              status === "Active" ? "bg-emerald-500" : "bg-muted-foreground/50",
                            )}
                          />
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-60 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            aria-label={`Edit ${name}`}
                            title="Edit user"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(u)}
                            aria-label={`Delete ${name}`}
                            title="Delete user"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
              {apiTotal === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
            </span>{" "}
            – {" "}
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

      {/* Create / Edit dialog */}
      <UserFormDialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setEditing(null);
        }}
        editing={editing}
        roles={roles}
        rolesLoading={rolesLoading}
        isSaving={createMut.isPending || updateMut.isPending}
        onSubmit={(body) => {
          if (editing) updateMut.mutate({ id: editing.id, body });
          else createMut.mutate(body);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleting != null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates{" "}
              <span className="font-semibold text-foreground">
                {asText(deleting?.name) === EMPTY
                  ? deleting?.username || `#${deleting?.id}`
                  : asText(deleting?.name)}
              </span>
              . They will no longer be able to sign in. You can recreate or
              reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleting) deleteMut.mutate(deleting.id);
              }}
              disabled={deleteMut.isPending}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ---- User create/edit form dialog ---- */

// Body shape sent to POST /users and PATCH /users/:id. Snake_case keys match
// CreateUserDto/UpdateUserDto. `password` is omitted from PATCH when left blank
// so the stored hash is preserved (service leaves it untouched when absent).
interface UserWriteBody {
  name?: string;
  username?: string;
  password?: string;
  email?: string;
  phone?: string;
  role_id?: number;
  status: number;
}

function UserFormDialog({
  open,
  onOpenChange,
  editing,
  roles,
  rolesLoading,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  editing: ApiUserRow | null;
  roles: ApiRole[];
  rolesLoading: boolean;
  isSaving: boolean;
  onSubmit: (body: UserWriteBody) => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState<string>("none");
  const [status, setStatus] = useState<string>("1");

  const isEdit = editing != null;

  // Reseed the form whenever the dialog opens (from the edited row, or blank
  // for create). Resetting on open keeps create/edit modes isolated.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setUsername(editing?.username ?? "");
    setEmail(editing?.email ?? "");
    setPhone(editing?.phone ?? "");
    setPassword("");
    setRoleId(editing?.role_id != null ? String(editing.role_id) : "none");
    setStatus(editing?.status === 0 ? "0" : "1");
  }, [open, editing]);

  const trimmedPassword = password.trim();
  // Create requires a password (CreateUserDto.password is mandatory); edit only
  // sends one when the field is filled in.
  const canSubmit = isEdit || trimmedPassword.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !canSubmit) return;

    const trimOrUndefined = (value: string) => {
      const v = value.trim();
      return v !== "" ? v : undefined;
    };

    const body: UserWriteBody = {
      status: Number(status),
      name: trimOrUndefined(name),
      username: trimOrUndefined(username),
      email: trimOrUndefined(email),
      phone: trimOrUndefined(phone),
      role_id: roleId !== "none" ? Number(roleId) : undefined,
      password: trimmedPassword !== "" ? trimmedPassword : undefined,
    };

    onSubmit(body);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "New user"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this user's profile, role and access status."
              : "Create a platform user. A username and password let them sign in."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="user-name">Full name</Label>
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-username">Username</Label>
              <Input
                id="user-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jane.doe"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">
                Password{" "}
                {isEdit && (
                  <span className="font-normal text-muted-foreground">
                    (leave blank to keep)
                  </span>
                )}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? "••••••••" : "Required"}
                autoComplete="new-password"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-phone">Phone</Label>
              <Input
                id="user-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 90000 00000"
                maxLength={30}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger id="user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No role</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {asText(r.title)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rolesLoading && (
                <div className="text-xs text-muted-foreground">
                  Loading roles…
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="user-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Active</SelectItem>
                  <SelectItem value="0">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isEdit && !canSubmit && (
            <p className="text-xs text-muted-foreground">
              A password is required to create a user.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !canSubmit}>
              {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Roles tab ============================ */

function RolesTab({
  roles,
  isLoading,
  isError,
  error,
  refetch,
  isFetching,
}: {
  roles: ApiRole[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  isFetching: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          {isLoading ? "Loading…" : `${roles.length.toLocaleString()} roles`}
          {isFetching && !isLoading && (
            <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin align-text-bottom text-muted-foreground/60" />
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Access roles assigned to platform users
        </div>
      </div>

      {isLoading ? (
        <StateBlock icon={RefreshCcw} spin tone="muted" title="Loading roles…" />
      ) : isError ? (
        <StateBlock
          icon={AlertTriangle}
          tone="error"
          title="Couldn’t load roles"
          subtitle={error instanceof Error ? error.message : "Please try again."}
          action={{ label: "Retry", onClick: refetch }}
        />
      ) : roles.length === 0 ? (
        <StateBlock icon={Shield} tone="muted" title="No roles defined" />
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <div
              key={r.id}
              className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition hover:border-primary/40 hover:shadow-card"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserCog className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {asText(r.title)}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  {r.id}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Created {formatDate(r.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ Settings tab ============================ */

function SettingsTab() {
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => apiGet<SettingsMap>("/settings"),
  });

  const [search, setSearch] = useState("");

  const entries = useMemo(() => {
    const map: SettingsMap = data ?? {};
    const all = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      ([key, value]) =>
        key.toLowerCase().includes(q) || (value ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const totalKeys = data ? Object.keys(data).length : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="text-sm font-semibold text-foreground">
          {isLoading ? "Loading…" : `${totalKeys.toLocaleString()} settings`}
          {isFetching && !isLoading && (
            <RefreshCcw className="ml-2 inline h-3.5 w-3.5 animate-spin align-text-bottom text-muted-foreground/60" />
          )}
          {/* Read-only: PATCH /api/settings exists but this tab has no edit
              affordances yet; inline editing is a separate task. */}
          <span className="ml-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 align-text-bottom text-[11px] font-medium text-muted-foreground">
            Read-only
          </span>
        </div>
        <div className="relative w-full sm:w-64">
          <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9 text-sm"
            placeholder="Search settings"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={isLoading || isError}
          />
        </div>
      </div>

      {isLoading ? (
        <StateBlock icon={RefreshCcw} spin tone="muted" title="Loading settings…" />
      ) : isError ? (
        <StateBlock
          icon={AlertTriangle}
          tone="error"
          title="Couldn’t load settings"
          subtitle={error instanceof Error ? error.message : "Please try again."}
          action={{ label: "Retry", onClick: () => refetch() }}
        />
      ) : entries.length === 0 ? (
        <StateBlock
          icon={SettingsIcon}
          tone="muted"
          title={totalKeys === 0 ? "No settings configured" : "No settings match your search"}
        />
      ) : (
        <div className="divide-y divide-border">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">
                    {humanizeKey(key)}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {key}
                  </div>
                </div>
              </div>
              <div className="max-w-[60%] text-right">
                {value != null && value.trim() !== "" ? (
                  <code className="break-all rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">
                    {value}
                  </code>
                ) : (
                  <span className="text-xs italic text-muted-foreground">not set</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ Shared helpers ============================ */

function Avatar({ name, src }: { name: string; src: string | null }) {
  const [broken, setBroken] = useState(false);
  if (src && src.trim() !== "" && !broken) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setBroken(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
      {initials(name)}
    </div>
  );
}

function StateBlock({
  icon: Icon,
  title,
  subtitle,
  tone,
  spin,
  action,
}: {
  icon: typeof Users;
  title: string;
  subtitle?: string;
  tone: "muted" | "error";
  spin?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon
        className={cn(
          tone === "error" ? "h-10 w-10 text-red-500/60" : "h-9 w-9 text-muted-foreground/50",
          spin && "animate-spin",
        )}
      />
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          {action.label}
        </button>
      )}
    </div>
  );
}
