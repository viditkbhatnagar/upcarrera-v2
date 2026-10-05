import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiPatch, apiPost, ApiError } from "@/lib/api";
import {
  Download,
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Users,
  UsersRound,
  Network,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  RefreshCcw,
  Loader2,
  AlertTriangle,
  Save,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ApiGroup,
  type ApiSalesTeam,
  csvDate,
  describeFailures,
  displayEmpId,
  downloadCsv,
  EMPTY,
  Field,
  groupDisplayName,
  leaderLabel,
  NONE,
  personLabel,
  runSteps,
  teamCode,
  unknownUser,
  useConsultantsList,
  useGroupsList,
  useOnOpen,
  useTeamsList,
} from "@/components/teams/team-shared";

export const Route = createFileRoute("/counsellors/groups")({
  head: () => ({ meta: [{ title: "Groups — upCarrera" }] }),
  component: GroupsPage,
});

type GroupStatus = "Active" | "Inactive";

const STATUS_STYLES: Record<GroupStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
const STATUS_DOT: Record<GroupStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
};

// --- Live API wiring (GET /consultants/groups) -----------------------
// Real counsellor groups (counsellor_group, migration 001). The API resolves
// the manager's name and rolls the team / counsellor counts up from the live
// membership, and reports separately how many counsellors are in no team at
// all — that number is shown as a note, never as an invented "Unassigned"
// group row.

/**
 * A group as the table renders it. Display fields are for rendering ONLY; the
 * Edit dialog seeds from `raw`.
 */
interface GroupRow {
  id: number;
  code: string;
  name: string;
  manager: string;
  managerKnown: boolean;
  totalTeams: number;
  totalCounsellors: number;
  status: GroupStatus;
  raw: ApiGroup;
}

function managerLabel(g: ApiGroup): string {
  if (g.manager && g.manager.trim() !== "") return g.manager.trim();
  return g.manager_id != null ? unknownUser(g.manager_id) : EMPTY;
}

function mapApiGroup(g: ApiGroup): GroupRow {
  return {
    id: g.id,
    code: g.code && g.code.trim() !== "" ? g.code.trim() : `#${g.id}`,
    name: groupDisplayName(g),
    manager: managerLabel(g),
    managerKnown: !!(g.manager && g.manager.trim()),
    totalTeams: g.total_teams ?? 0,
    totalCounsellors: g.total_counsellors ?? 0,
    status: g.status === 0 ? "Inactive" : "Active",
    raw: g,
  };
}

type StatusFilter = GroupStatus | "All";

const PAGE_SIZE = 10;

function invalidateHierarchy(qc: ReturnType<typeof useQueryClient>) {
  // Groups live under ["consultants", "groups"]; team rows carry group_name.
  qc.invalidateQueries({ queryKey: ["consultants"] });
  qc.invalidateQueries({ queryKey: ["sales-teams"] });
}

function GroupsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [managerFilter, setManagerFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const [viewing, setViewing] = useState<ApiGroup | null>(null);
  const [editing, setEditing] = useState<ApiGroup | null>(null);
  const [deleting, setDeleting] = useState<ApiGroup | null>(null);

  const { data, isLoading, isError, error, isFetching } = useGroupsList();

  const allGroups = useMemo(() => (data?.items ?? []).map(mapApiGroup), [data]);

  const managerOptions = useMemo(
    () =>
      [...new Set(allGroups.filter((g) => g.managerKnown).map((g) => g.manager))].sort(),
    [allGroups],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allGroups.filter((g) => {
      if (statusFilter !== "All" && g.status !== statusFilter) return false;
      if (managerFilter !== "All" && g.manager !== managerFilter) return false;
      if (
        s &&
        !g.name.toLowerCase().includes(s) &&
        !g.code.toLowerCase().includes(s) &&
        !g.manager.toLowerCase().includes(s)
      )
        return false;
      return true;
    });
  }, [allGroups, statusFilter, managerFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const totals = useMemo(() => {
    const active = allGroups.filter((g) => g.status === "Active").length;
    const totalTeams = allGroups.reduce((sum, g) => sum + g.totalTeams, 0);
    const totalCounsellors = data?.total_counsellors ?? 0;
    return { active, totalTeams, totalCounsellors };
  }, [allGroups, data]);
  const unassigned = data?.unassigned_counsellors ?? 0;

  const resetFilters = () => {
    setStatusFilter("All");
    setManagerFilter("All");
    setSearch("");
    setPage(1);
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info("No groups to export with the current filters");
      return;
    }
    downloadCsv(
      `groups-${csvDate()}.csv`,
      ["Group ID", "Group Name", "Manager", "Total Teams", "Total Counsellors", "Status"],
      filtered.map((g) => [g.code, g.name, g.manager, g.totalTeams, g.totalCounsellors, g.status]),
    );
  };

  const deleteMut = useMutation({
    mutationFn: (g: ApiGroup) => apiDelete(`/consultants/groups/${g.id}`),
    onSuccess: (_d, g) => {
      invalidateHierarchy(qc);
      toast.success(`Group “${groupDisplayName(g)}” deleted`);
      setDeleting(null);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn’t delete the group"),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Counsellor Management
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Groups
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage multiple teams.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setOpenCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            Create Group
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={Network}
            label="Total Groups"
            value={allGroups.length}
            active={statusFilter === "All"}
            onClick={() => {
              setStatusFilter("All");
              setPage(1);
            }}
            accent="bg-primary/10 text-primary"
          />
          <KpiCard
            icon={ShieldCheck}
            label="Active Groups"
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
            icon={UsersRound}
            label="Teams in Groups"
            value={totals.totalTeams}
            accent="bg-indigo-500/10 text-indigo-600"
          />
          <KpiCard
            icon={Users}
            label="Counsellors in Groups"
            value={totals.totalCounsellors}
            accent="bg-amber-500/10 text-amber-600"
          />
        </div>
        {!isLoading && !isError && unassigned > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            {unassigned.toLocaleString()} {unassigned === 1 ? "counsellor is" : "counsellors are"} not
            in any team, so not in any group.{" "}
            <Link to="/counsellors/teams" className="font-semibold text-primary hover:underline">
              Assign them on Teams
            </Link>
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="Search group, ID, manager"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {/* Manager options come from the managers the groups actually have. */}
          <Select
            value={managerFilter}
            onValueChange={(v) => {
              setManagerFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Managers</SelectItem>
              {managerOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as StatusFilter);
              setPage(1);
            }}
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

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {filtered.length.toLocaleString()} groups
            {isFetching && !isLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
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
            Sorted by <span className="font-medium text-foreground">Oldest first</span>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading groups…</div>
              <div className="text-xs text-muted-foreground">
                Fetching counsellor groups.
              </div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-rose-500/60" />
              <div className="text-sm font-semibold text-foreground">
                Couldn’t load groups
              </div>
              <div className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Please try again."}
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Network className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No groups found</div>
              <div className="text-xs text-muted-foreground">
                {allGroups.length === 0
                  ? "No groups exist yet. Create one to start organising teams."
                  : "Try adjusting your filters or create a new group."}
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Group ID</th>
                  <th className="px-4 py-2.5 font-semibold">Group Name</th>
                  <th className="px-4 py-2.5 font-semibold">Manager</th>
                  <th className="px-4 py-2.5 font-semibold">Total Teams</th>
                  <th className="px-4 py-2.5 font-semibold">Total Counsellors</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((g, i) => (
                  <tr
                    key={g.id}
                    className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                      {pageStart + i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {g.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Network className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-semibold text-foreground">
                          {g.name}
                        </div>
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-sm",
                        g.managerKnown ? "text-foreground" : "italic text-muted-foreground",
                      )}
                    >
                      {g.manager}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                        <UsersRound className="h-3 w-3" />
                        {g.totalTeams}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                        <Users className="h-3 w-3" />
                        {g.totalCounsellors}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap",
                          STATUS_STYLES[g.status],
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[g.status])} />
                        {g.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn icon={Eye} label={`View ${g.name}`} onClick={() => setViewing(g.raw)} />
                        <IconBtn icon={Pencil} label={`Edit ${g.name}`} onClick={() => setEditing(g.raw)} />
                        <IconBtn
                          icon={Trash2}
                          label={`Delete ${g.name}`}
                          onClick={() => setDeleting(g.raw)}
                          danger
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
              {filtered.length === 0 ? 0 : pageStart + 1}
            </span>{" "}
            –{" "}
            <span className="font-semibold text-foreground">
              {Math.min(pageStart + PAGE_SIZE, filtered.length)}
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

      <GroupFormDialog
        mode="create"
        group={null}
        open={openCreate}
        onOpenChange={setOpenCreate}
      />
      <GroupFormDialog
        mode="edit"
        group={editing}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
      />
      <GroupViewDialog
        group={viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        onEdit={(g) => {
          setViewing(null);
          setEditing(g);
        }}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && !deleteMut.isPending && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete group “{deleting ? groupDisplayName(deleting) : ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && deleting.total_teams > 0
                ? `Its ${deleting.total_teams} ${deleting.total_teams === 1 ? "team" : "teams"} will be detached and left with no group. The teams and their counsellors are not deleted.`
                : "This group has no teams. Nothing else is affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending}
              onClick={(e) => {
                // Keep the dialog open until the server confirms.
                e.preventDefault();
                if (deleting) deleteMut.mutate(deleting);
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleteMut.isPending ? "Deleting…" : "Delete group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  value: number | string;
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
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </Comp>
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background",
        danger ? "hover:text-rose-600" : "hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/* ---------------- Create / Edit ---------------- */

/** Form state seeded from the RAW group row (or blank for create). */
interface GroupForm {
  code: string;
  name: string;
  /** users.id as a string, or NONE. */
  manager: string;
  /** Raw status code as a string. */
  status: string;
  /** sales_team ids in this group. */
  teams: number[];
}

interface GroupBody {
  code?: string | null;
  name?: string;
  manager_id?: number | null;
  status?: number;
}

function blankGroupForm(): GroupForm {
  return { code: "", name: "", manager: NONE, status: "1", teams: [] };
}

function seedGroupForm(g: ApiGroup, teams: ApiSalesTeam[]): GroupForm {
  return {
    code: g.code ?? "",
    name: g.name ?? "",
    manager: g.manager_id != null ? String(g.manager_id) : NONE,
    status: String(g.status ?? 1),
    teams: teams.filter((t) => t.group_id === g.id).map((t) => t.id),
  };
}

/** POST body: everything the operator filled in. */
function createBody(form: GroupForm): GroupBody & { name: string } {
  const code = form.code.trim();
  return {
    name: form.name.trim(),
    ...(code ? { code } : {}),
    ...(form.manager !== NONE ? { manager_id: Number(form.manager) } : {}),
    status: Number(form.status),
  };
}

/** PATCH body: only what changed against the raw seed. */
function diffGroupForm(seed: GroupForm, form: GroupForm): GroupBody {
  const body: GroupBody = {};
  const code = form.code.trim();
  if (code !== seed.code.trim()) body.code = code === "" ? null : code;
  if (form.name.trim() !== seed.name.trim()) body.name = form.name.trim();
  if (form.manager !== seed.manager) body.manager_id = form.manager === NONE ? null : Number(form.manager);
  if (form.status !== seed.status) body.status = Number(form.status);
  return body;
}

/**
 * Create Group (QA G01) and Edit Group.
 *
 * Create: POST /consultants/groups, then PATCH /consultants/teams/:id/group for
 * each selected team. Edit: PATCH /consultants/groups/:id with only the changed
 * fields, then attach / detach exactly the teams whose selection changed.
 */
function GroupFormDialog({
  mode,
  group,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  group: ApiGroup | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: teamsData, isLoading: teamsLoading } = useTeamsList();
  const { data: consultantsData, isLoading: consultantsLoading } = useConsultantsList();
  const teams = useMemo(() => teamsData?.items ?? [], [teamsData]);
  const consultants = useMemo(() => consultantsData?.items ?? [], [consultantsData]);

  const [seed, setSeed] = useState<GroupForm>(blankGroupForm);
  const [form, setForm] = useState<GroupForm>(blankGroupForm);
  const [teamSearch, setTeamSearch] = useState("");

  // Whether the team selection has been seeded from loaded data yet.
  const [teamsSeeded, setTeamsSeeded] = useState(false);

  useOnOpen(open, () => {
    const s = mode === "edit" && group ? seedGroupForm(group, teams) : blankGroupForm();
    setSeed(s);
    setForm(s);
    setTeamSearch("");
    setTeamsSeeded(mode === "create" || !!teamsData);
  });

  // Opened before the team list arrived: seed the selection once it does, so
  // the checklist shows the group's real teams instead of none.
  useEffect(() => {
    if (!open || teamsSeeded || !teamsData || mode !== "edit" || !group) return;
    const ids = teamsData.items.filter((t) => t.group_id === group.id).map((t) => t.id);
    setSeed((prev) => ({ ...prev, teams: ids }));
    setForm((prev) => ({ ...prev, teams: ids }));
    setTeamsSeeded(true);
  }, [open, teamsSeeded, teamsData, mode, group]);

  const managerOptions = useMemo(() => {
    const opts = consultants
      .map((c) => ({
        value: String(c.id),
        label: `${personLabel(c.name, c.id)} · ${displayEmpId(c.employee_code, c.id)}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // The stored manager may not be in the counsellor list; keep it visible.
    if (group && seed.manager !== NONE && !opts.some((o) => o.value === seed.manager)) {
      opts.unshift({ value: seed.manager, label: `${managerLabel(group)} (current)` });
    }
    return opts;
  }, [consultants, group, seed.manager]);

  const teamRows = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return teams
      .map((t) => ({
        id: t.id,
        code: teamCode(t.id),
        name: t.name?.trim() || `Team #${t.id}`,
        leader: leaderLabel(t),
        memberCount: t.members_count ?? 0,
        // Already in a DIFFERENT group: selecting it moves it here.
        elsewhere:
          t.group_id != null && t.group_id !== group?.id
            ? t.group_name?.trim() || `group #${t.group_id}`
            : null,
      }))
      .filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          (t.elsewhere ?? "").toLowerCase().includes(q),
      );
  }, [teams, teamSearch, group?.id]);

  const toggleTeam = (id: number) =>
    setForm((f) => ({
      ...f,
      teams: f.teams.includes(id) ? f.teams.filter((x) => x !== id) : [...f.teams, id],
    }));

  const attach = form.teams.filter((id) => !seed.teams.includes(id));
  const detach = mode === "edit" ? seed.teams.filter((id) => !form.teams.includes(id)) : [];
  const patchBody = mode === "edit" ? diffGroupForm(seed, form) : {};
  const changed =
    mode === "create" ||
    Object.keys(patchBody).length > 0 ||
    attach.length > 0 ||
    detach.length > 0;
  const nameOk = form.name.trim() !== "";

  const mut = useMutation({
    mutationFn: async () => {
      // A failure here throws: nothing was written, the dialog stays open.
      let groupId: number;
      if (mode === "create") {
        const created = await apiPost<{ id: number }>("/consultants/groups", createBody(form));
        groupId = created.id;
      } else {
        if (!group) throw new Error("No group selected");
        groupId = group.id;
        if (Object.keys(patchBody).length > 0) {
          await apiPatch(`/consultants/groups/${groupId}`, patchBody);
        }
      }

      const nameOf = (id: number) => teams.find((t) => t.id === id)?.name?.trim() || teamCode(id);
      const failures = await runSteps([
        ...attach.map((id) => ({
          label: `Attach ${nameOf(id)}`,
          run: () => apiPatch(`/consultants/teams/${id}/group`, { group_id: groupId }),
        })),
        ...detach.map((id) => ({
          label: `Detach ${nameOf(id)}`,
          run: () => apiPatch(`/consultants/teams/${id}/group`, { group_id: null }),
        })),
      ]);
      return { failures };
    },
    onSuccess: ({ failures }) => {
      invalidateHierarchy(qc);
      const label = form.name.trim();
      const verb = mode === "create" ? "created" : "updated";
      if (failures.length === 0) {
        toast.success(`Group “${label}” ${verb}`);
      } else {
        toast.warning(
          `Group “${label}” was ${verb}, but some team changes did not save — ${describeFailures(failures)}`,
          { duration: 12000 },
        );
      }
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : `Couldn’t ${mode === "create" ? "create" : "update"} the group`,
      ),
  });

  const canSubmit =
    nameOk && changed && teamsSeeded && !mut.isPending && (mode === "create" || !!group);

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {mode === "create" ? "Create Group" : "Edit Group"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Set up a new group and assign teams under a group manager."
              : "Change the group’s details or which teams sit under it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Group Name">
              <Input
                placeholder="e.g. North Region"
                value={form.name}
                maxLength={160}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Group Code" hint="Optional. Must be unique, e.g. GR-002.">
              <Input
                placeholder="e.g. GR-002"
                value={form.code}
                maxLength={32}
                className="font-mono"
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </Field>

            <Field label="Group Manager">
              <Select
                value={form.manager}
                onValueChange={(v) => setForm((f) => ({ ...f, manager: v }))}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={consultantsLoading ? "Loading counsellors…" : "Pick from counsellors"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No manager yet</SelectItem>
                  {managerOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {seed.status !== "1" && seed.status !== "0" && (
                    <SelectItem value={seed.status}>Code {seed.status} (current)</SelectItem>
                  )}
                  <SelectItem value="1">Active</SelectItem>
                  <SelectItem value="0">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Assign Teams */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">Assign Teams</Label>
              <span className="text-xs text-muted-foreground">{form.teams.length} selected</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9 text-sm"
                placeholder="Search teams by name, ID or group"
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
              />
            </div>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-border bg-background/40 scrollbar-thin">
              {teamRows.length === 0 && (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {teamsLoading
                    ? "Loading teams…"
                    : teams.length === 0
                      ? "No teams exist yet."
                      : "No teams match this search."}
                </div>
              )}
              {teamRows.map((t) => {
                const checked = form.teams.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTeam(t.id)}
                    aria-pressed={checked}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                      checked && "bg-primary/5",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <UsersRound className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{t.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {t.code} · {t.memberCount}{" "}
                          {t.memberCount === 1 ? "counsellor" : "counsellors"} · Leader {t.leader}
                        </div>
                        {t.elsewhere && (
                          <div className="truncate text-[11px] text-amber-700">
                            In {t.elsewhere} — selecting moves it here
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-surface",
                      )}
                    >
                      {checked && <Check className="h-3.5 w-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => canSubmit && mut.mutate()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "create" ? (
              <Plus className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {mut.isPending
              ? "Saving…"
              : mode === "create"
                ? "Create Group"
                : changed
                  ? "Save Changes"
                  : "No changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- View ---------------- */

function GroupViewDialog({
  group,
  onOpenChange,
  onEdit,
}: {
  group: ApiGroup | null;
  onOpenChange: (v: boolean) => void;
  onEdit: (g: ApiGroup) => void;
}) {
  const { data: teamsData, isLoading } = useTeamsList();
  const teams = useMemo(
    () => (teamsData?.items ?? []).filter((t) => group && t.group_id === group.id),
    [teamsData, group],
  );

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {group ? groupDisplayName(group) : ""}
          </DialogTitle>
          <DialogDescription>
            {group?.code ? <span className="font-mono">{group.code}</span> : "No group code"}
          </DialogDescription>
        </DialogHeader>

        {group && (
          <div className="space-y-4 py-1">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <ViewStat label="Manager" value={managerLabel(group)} />
              <ViewStat label="Status" value={group.status === 0 ? "Inactive" : "Active"} />
              <ViewStat label="Teams" value={String(group.total_teams)} />
              <ViewStat label="Counsellors" value={String(group.total_counsellors)} />
            </dl>

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Teams in this group
              </div>
              {isLoading ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">Loading teams…</div>
              ) : teams.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No teams in this group yet.
                </div>
              ) : (
                <ul>
                  {teams.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {t.name?.trim() || `Team #${t.id}`}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {teamCode(t.id)} · Leader {leaderLabel(t)} · {t.members_count ?? 0}{" "}
                          {(t.members_count ?? 0) === 1 ? "counsellor" : "counsellors"}
                        </div>
                      </div>
                      <Link
                        to="/counsellors/team-profile/$teamId"
                        params={{ teamId: String(t.id) }}
                        className="shrink-0 text-xs font-semibold text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => group && onEdit(group)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Pencil className="h-4 w-4" /> Edit Group
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold text-foreground">{value}</dd>
    </div>
  );
}
