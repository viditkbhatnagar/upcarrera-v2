import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiPost, ApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Download,
  Plus,
  Search,
  Eye,
  Pencil,
  Users,
  UsersRound,
  UserCog,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCcw,
  Loader2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ApiSalesTeam,
  consultantEntries,
  csvDate,
  describeFailures,
  displayEmpId,
  downloadCsv,
  Field,
  groupDisplayName,
  groupLabel,
  leaderLabel,
  mapTeamStatus,
  MemberChecklist,
  NONE,
  personLabel,
  runSteps,
  teamCode,
  type TeamStatus,
  useConsultantsList,
  useGroupsList,
  useOnOpen,
  useTeamsList,
} from "@/components/teams/team-shared";
import { EditTeamDialog } from "@/components/teams/team-dialogs";

export const Route = createFileRoute("/counsellors/teams")({
  head: () => ({ meta: [{ title: "Teams — upCarrera" }] }),
  component: TeamsPage,
});


/**
 * A team as the table renders it. Every display field is derived from `raw`
 * for rendering only; the Edit dialog seeds from `raw`, never from these.
 */
interface TeamRow {
  /** sales_team.id — what links and requests use. */
  id: number;
  /** Display code (TM-0001). Display only. */
  code: string;
  name: string;
  leader: string;
  group: string;
  groupId: number | null;
  totalCounsellors: number;
  status: TeamStatus;
  raw: ApiSalesTeam;
}

const STATUS_STYLES: Record<TeamStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
const STATUS_DOT: Record<TeamStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
};

/**
 * Map a live sales_team row into the table shape. The leader and the members
 * are users.id values; the API resolves them (leader_name / members_count) and
 * an id that resolves to no one renders "Unknown user #30", never "30".
 * There is no per-team target column, so none is shown.
 */
function mapApiTeam(t: ApiSalesTeam): TeamRow {
  return {
    id: t.id,
    code: teamCode(t.id),
    name: t.name && t.name.trim() !== "" ? t.name.trim() : `Team #${t.id}`,
    leader: leaderLabel(t),
    group: groupLabel(t),
    groupId: t.group_id ?? null,
    totalCounsellors:
      t.members_count ?? (Array.isArray(t.members) ? t.members.length : 0),
    status: mapTeamStatus(t.status),
    raw: t,
  };
}

/** Request body for POST /sales-teams (CreateSalesTeamDto). */
interface CreateTeamBody {
  name: string;
  leader?: string;
  members: number[];
  status: number;
}

type StatusFilter = TeamStatus | "All";
/** A group id as a string, NONE for "no group", or "All". */
type GroupFilter = string;

const PAGE_SIZE = 10;

function TeamsPage() {
  // Live sales teams. The list endpoint paginates server-side, so pull a large
  // page once and let the search/group/status/paging filters refine
  // client-side over the real rows.
  const { data: teamsData, isLoading, isError } = useTeamsList();
  const consultantsQuery = useConsultantsList();
  const { data: groupsData } = useGroupsList();

  const allTeams = useMemo<TeamRow[]>(
    () => (teamsData?.items ?? []).map(mapApiTeam),
    [teamsData],
  );
  const groups = useMemo(() => groupsData?.items ?? [], [groupsData]);
  const totalCounsellorsCount = consultantsQuery.data?.total ?? 0;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<ApiSalesTeam | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return allTeams.filter((t) => {
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      if (groupFilter !== "All") {
        if (groupFilter === NONE ? t.groupId !== null : String(t.groupId) !== groupFilter)
          return false;
      }
      if (
        s &&
        !t.name.toLowerCase().includes(s) &&
        !t.code.toLowerCase().includes(s) &&
        !t.leader.toLowerCase().includes(s)
      )
        return false;
      return true;
    });
  }, [allTeams, statusFilter, groupFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const totals = useMemo(() => {
    const active = allTeams.filter((t) => t.status === "Active").length;
    // Distinct stored leader ids — teams with no leader do not count as one.
    const leaders = new Set(
      allTeams.map((t) => t.raw.leader?.trim()).filter((l): l is string => !!l),
    ).size;
    return { active, totalCounsellors: totalCounsellorsCount, leaders };
  }, [allTeams, totalCounsellorsCount]);

  const resetFilters = () => {
    setStatusFilter("All");
    setGroupFilter("All");
    setSearch("");
    setPage(1);
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info("No teams to export with the current filters");
      return;
    }
    downloadCsv(
      `teams-${csvDate()}.csv`,
      ["Team ID", "Team Name", "Team Leader", "Group", "Total Counsellors", "Status"],
      filtered.map((t) => [t.code, t.name, t.leader, t.group, t.totalCounsellors, t.status]),
    );
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
            Teams
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage teams and team leaders.
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
            Create Team
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={UsersRound}
          label="Total Teams"
          value={allTeams.length}
          active={statusFilter === "All"}
          onClick={() => {
            setStatusFilter("All");
            setPage(1);
          }}
          accent="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Active Teams"
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
          icon={Users}
          label="Total Counsellors"
          value={totals.totalCounsellors}
          accent="bg-indigo-500/10 text-indigo-600"
        />
        <KpiCard
          icon={UserCog}
          label="Team Leaders"
          value={totals.leaders}
          accent="bg-amber-500/10 text-amber-600"
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9 text-sm"
              placeholder="Search team, ID, leader"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {/* Group filter: real counsellor groups (GET /consultants/groups). */}
          <Select
            value={groupFilter}
            onValueChange={(v) => {
              setGroupFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Groups</SelectItem>
              <SelectItem value={NONE}>No group</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {groupDisplayName(g)}
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
          <div className="text-sm font-semibold text-foreground">
            {filtered.length.toLocaleString()} teams
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
            Sorted by <span className="font-medium text-foreground">Newest first</span>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">Loading teams…</div>
              <div className="text-xs text-muted-foreground">
                Fetching the latest records.
              </div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-rose-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load teams</div>
              <div className="text-xs text-muted-foreground">
                Something went wrong. Please try again.
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <UsersRound className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No teams found</div>
              <div className="text-xs text-muted-foreground">
                Try adjusting your filters or create a new team.
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Team ID</th>
                  <th className="px-4 py-2.5 font-semibold">Team Name</th>
                  <th className="px-4 py-2.5 font-semibold">Team Leader</th>
                  <th className="px-4 py-2.5 font-semibold">Group</th>
                  <th className="px-4 py-2.5 font-semibold">Total Counsellors</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t, i) => (
                  <tr
                    key={t.id}
                    className="group border-b border-border last:border-0 transition hover:bg-muted/40"
                  >
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                      {pageStart + i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {t.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <UsersRound className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-semibold text-foreground">
                          {t.name}
                        </div>
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-sm",
                        t.raw.leader_name ? "text-foreground" : "italic text-muted-foreground",
                      )}
                    >
                      {t.leader}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{t.group}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                        <Users className="h-3 w-3" />
                        {t.totalCounsellors}
                      </span>
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
                        <Link
                          to="/counsellors/team-profile/$teamId"
                          params={{ teamId: String(t.id) }}
                          title="View"
                          aria-label={`View ${t.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <IconBtn
                          icon={Pencil}
                          label={`Edit ${t.name}`}
                          onClick={() => setEditing(t.raw)}
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

      <CreateTeamDialog open={openCreate} onOpenChange={setOpenCreate} />
      <EditTeamDialog
        team={editing}
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
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

/**
 * Create Team.
 *
 * 1. POST /sales-teams with name / leader / status and an EMPTY roster.
 * 2. PATCH /consultants/teams/:id/group when a parent group was picked (T02).
 * 3. PATCH /consultants/:id/team for each selected member, one at a time.
 *
 * Members are deliberately NOT sent in the POST body: that would write only the
 * legacy sales_team.members JSON and leave users.team_id unset, so the two
 * would disagree from the first save. The counsellor endpoint writes both (and
 * moves a counsellor out of any team they were in before).
 */
function CreateTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: consultantsData, isLoading: consultantsLoading } = useConsultantsList();
  const { data: groupsData, isLoading: groupsLoading } = useGroupsList();

  const consultants = useMemo(() => consultantsData?.items ?? [], [consultantsData]);
  const groups = useMemo(() => groupsData?.items ?? [], [groupsData]);
  const entries = useMemo(
    () =>
      consultantEntries(consultants, null).sort((a, b) => a.name.localeCompare(b.name)),
    [consultants],
  );

  const leaderOptions = useMemo(
    () =>
      consultants
        .map((c) => ({
          value: String(c.id),
          label: `${personLabel(c.name, c.id)} · ${displayEmpId(c.employee_code, c.id)}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [consultants],
  );

  const [name, setName] = useState("");
  // `leader` holds the users.id as a string: sales_team.leader is a VarChar(10)
  // id column, not a display name (the API rejects anything but digits).
  const [leader, setLeader] = useState(NONE);
  const [status, setStatus] = useState<TeamStatus>("Active");
  const [groupId, setGroupId] = useState(NONE);
  // Numeric users.id values.
  const [members, setMembers] = useState<number[]>([]);

  const toggle = (id: number) =>
    setMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const createMut = useMutation({
    mutationFn: async (input: { body: CreateTeamBody; groupId: number | null; members: number[] }) => {
      // If this throws, nothing was created and the dialog stays open.
      const created = await apiPost<ApiSalesTeam>("/sales-teams", input.body);
      const byId = new Map(consultants.map((c) => [c.id, c]));
      const group = groups.find((g) => g.id === input.groupId);
      const failures = await runSteps([
        ...(input.groupId !== null
          ? [
              {
                label: `Parent group ${group ? groupDisplayName(group) : `#${input.groupId}`}`,
                run: () =>
                  apiPatch(`/consultants/teams/${created.id}/group`, { group_id: input.groupId }),
              },
            ]
          : []),
        ...input.members.map((id) => ({
          label: `Add ${personLabel(byId.get(id)?.name, id)}`,
          run: () => apiPatch(`/consultants/${id}/team`, { team_id: created.id }),
        })),
      ]);
      return { created, failures };
    },
    onSuccess: ({ created, failures }) => {
      qc.invalidateQueries({ queryKey: ["sales-teams"] });
      qc.invalidateQueries({ queryKey: ["consultants"] });
      const label = created.name?.trim() || teamCode(created.id);
      if (failures.length === 0) {
        toast.success(`Team “${label}” created`);
      } else {
        // The team exists — say so — but be exact about what did not save.
        toast.warning(
          `Team “${label}” was created, but some changes did not save — ${describeFailures(failures)}. Use Manage Members or Transfer Team on its profile to finish.`,
          { duration: 12000 },
        );
      }
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn’t create the team"),
  });

  // Start every open from a clean slate so a cancelled draft never leaks into
  // the next team — including the previous attempt's inline error.
  useOnOpen(open, () => {
    setName("");
    setLeader(NONE);
    setStatus("Active");
    setGroupId(NONE);
    setMembers([]);
    createMut.reset();
  });

  const trimmedName = name.trim();
  const canSubmit = trimmedName !== "" && !createMut.isPending;

  const submit = () => {
    if (!canSubmit) return;
    createMut.mutate({
      body: {
        name: trimmedName,
        ...(leader !== NONE ? { leader } : {}),
        members: [],
        status: status === "Active" ? 1 : 0,
      },
      groupId: groupId === NONE ? null : Number(groupId),
      members,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !createMut.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Create Team</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Set up a new counsellor team, assign a team leader and place it in a group.
          </p>
        </DialogHeader>

        {/* "Team Code" is not offered: sales_team has no code column, so the
            TM-#### shown on the list is derived from the id after saving. */}
        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Team Name">
              <Input
                placeholder="e.g. Team Phoenix"
                value={name}
                maxLength={160}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Team Leader">
              <Select value={leader} onValueChange={setLeader}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      consultantsLoading ? "Loading counsellors…" : "Pick from counsellors"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No leader yet</SelectItem>
                  {leaderOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Parent Group"
              hint={!groupsLoading && groups.length === 0 ? "No groups exist yet." : undefined}
            >
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder={groupsLoading ? "Loading groups…" : "Pick a group"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {groupDisplayName(g)}
                      {g.code ? ` · ${g.code}` : ""}
                      {g.status === 0 ? " (Inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Status">
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as TeamStatus)}
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

          <MemberChecklist
            label="Add Team Members"
            entries={entries}
            selected={members}
            onToggle={toggle}
            loading={consultantsLoading}
            disabled={createMut.isPending}
          />
        </div>

        {createMut.isError && (
          <p className="text-sm text-rose-600">
            {createMut.error instanceof ApiError
              ? createMut.error.message
              : "Couldn’t create the team. Please try again."}
          </p>
        )}

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={createMut.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {createMut.isPending ? "Creating…" : "Create Team"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
