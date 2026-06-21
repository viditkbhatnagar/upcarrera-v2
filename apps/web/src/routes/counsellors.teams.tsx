import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
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
  Check,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GROUPS,
  TEAM_LEADERS,
} from "@/lib/counsellors-data";

export const Route = createFileRoute("/counsellors/teams")({
  head: () => ({ meta: [{ title: "Teams — upCarrera" }] }),
  component: TeamsPage,
});

type TeamStatus = "Active" | "Inactive";

interface TeamRow {
  id: string;
  name: string;
  leader: string;
  group: string;
  totalCounsellors: number;
  monthlyTarget: number;
  status: TeamStatus;
}

const STATUS_STYLES: Record<TeamStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
const STATUS_DOT: Record<TeamStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
};

const EMPTY = "—";

/** Shape returned by GET /sales-teams items[] (members parsed server-side). */
interface ApiSalesTeam {
  id: number;
  name?: string | null;
  leader?: string | null;
  members?: unknown[] | null;
  university_id?: string | null;
  course_id?: string | null;
  status?: number | null;
}

interface SalesTeamsResponse {
  items: ApiSalesTeam[];
  total: number;
  page: number;
  limit: number;
}

/** Shape returned by GET /consultants items[] (used for the member picker). */
interface ApiConsultant {
  id: number;
  name?: string | null;
  code?: number | null;
  highest_qualification?: string | null;
}

interface ConsultantsResponse {
  items: ApiConsultant[];
  total: number;
  page: number;
  limit: number;
}

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

/** Legacy sales_team.status is an Int (1 = active); there is no on-leave team. */
function mapTeamStatus(status: number | null | undefined): TeamStatus {
  return status === 1 ? "Active" : "Inactive";
}

/**
 * Map a live sales_team row into the TeamRow shape the table consumes. Fields
 * with no schema source (group, monthly target) surface as "—"/0 — never faked.
 */
function mapApiTeam(t: ApiSalesTeam): TeamRow {
  return {
    id: `TM-${String(t.id).padStart(4, "0")}`,
    name: t.name && t.name.trim() !== "" ? t.name : EMPTY,
    leader: asText(t.leader),
    group: EMPTY,
    totalCounsellors: Array.isArray(t.members) ? t.members.length : 0,
    monthlyTarget: 0,
    status: mapTeamStatus(t.status),
  };
}

/** Map a live consultant into the {empId,name,designation} the picker reads. */
function mapApiCounsellorOption(c: ApiConsultant) {
  return {
    empId: c.code != null ? `UC-${c.code}` : `UC-${c.id}`,
    name: c.name && c.name.trim() !== "" ? c.name : EMPTY,
    designation: asText(c.highest_qualification),
  };
}

type StatusFilter = TeamStatus | "All";

function TeamsPage() {
  // Live sales teams. The list endpoint paginates server-side, so pull a large
  // page once and let the existing search/group/status/paging filters refine
  // client-side over the real rows — identical to how the mock array was used.
  const { data: teamsData, isLoading, isError } = useQuery({
    queryKey: ["sales-teams", "list"],
    queryFn: () => apiGet<SalesTeamsResponse>("/sales-teams", { limit: 1000 }),
  });
  const consultantsQuery = useQuery({
    queryKey: ["consultants", "list"],
    queryFn: () => apiGet<ConsultantsResponse>("/consultants", { limit: 1000 }),
  });

  const ALL_TEAMS = useMemo<TeamRow[]>(
    () => (teamsData?.items ?? []).map(mapApiTeam),
    [teamsData],
  );
  const totalCounsellorsCount = consultantsQuery.data?.total ?? 0;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    return ALL_TEAMS.filter((t) => {
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      if (groupFilter !== "All" && t.group !== groupFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !t.name.toLowerCase().includes(s) &&
          !t.id.toLowerCase().includes(s) &&
          !t.leader.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [ALL_TEAMS, statusFilter, search, groupFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const totals = useMemo(() => {
    const active = ALL_TEAMS.filter((t) => t.status === "Active").length;
    const totalCounsellors = totalCounsellorsCount;
    const leaders = new Set(ALL_TEAMS.map((t) => t.leader)).size;
    return { active, totalCounsellors, leaders };
  }, [ALL_TEAMS, totalCounsellorsCount]);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setGroupFilter("All");
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
            Teams
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage teams and team leaders.
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
            Create Team
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={UsersRound}
          label="Total Teams"
          value={ALL_TEAMS.length}
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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              {["All", ...GROUPS].map((g) => (
                <SelectItem key={g} value={g}>
                  {g === "All" ? "All Groups" : g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
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

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            {filtered.length.toLocaleString()} teams
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
            Sorted by <span className="font-medium text-foreground">Team ID</span>
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
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Team ID</th>
                  <th className="px-4 py-2.5 font-semibold">Team Name</th>
                  <th className="px-4 py-2.5 font-semibold">Team Leader</th>
                  <th className="px-4 py-2.5 font-semibold">Group</th>
                  <th className="px-4 py-2.5 font-semibold">Total Counsellors</th>
                  <th className="px-4 py-2.5 font-semibold">Active Monthly Target</th>
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
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {t.id}
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
                    <td className="px-4 py-3 text-sm text-foreground">{t.leader}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{t.group}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                        <Users className="h-3 w-3" />
                        {t.totalCounsellors}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">
                      {t.monthlyTarget.toLocaleString()}
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
                          params={{ teamId: t.id }}
                          title="View"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition hover:border-border hover:bg-background hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <IconBtn icon={Pencil} label="Edit" />
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

      <CreateTeamDialog open={openCreate} onOpenChange={setOpenCreate} />
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

function CreateTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: teamsData } = useQuery({
    queryKey: ["sales-teams", "list"],
    queryFn: () => apiGet<SalesTeamsResponse>("/sales-teams", { limit: 1000 }),
  });
  const { data: consultantsData } = useQuery({
    queryKey: ["consultants", "list"],
    queryFn: () => apiGet<ConsultantsResponse>("/consultants", { limit: 1000 }),
  });

  const teamCount = teamsData?.total ?? 0;
  const allCounsellors = useMemo(
    () => (consultantsData?.items ?? []).map(mapApiCounsellorOption),
    [consultantsData],
  );

  const autoCode = useMemo(
    () => `TM-${String(2000 + teamCount + 1).padStart(4, "0")}`,
    [teamCount],
  );
  const [members, setMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");

  const filteredMembers = useMemo(() => {
    const s = memberSearch.toLowerCase();
    return allCounsellors.filter(
      (c) =>
        !s ||
        c.name.toLowerCase().includes(s) ||
        c.empId.toLowerCase().includes(s),
    ).slice(0, 30);
  }, [allCounsellors, memberSearch]);

  const toggle = (id: string) =>
    setMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Create Team</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Set up a new counsellor team and assign a team leader.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Team Name">
              <Input placeholder="e.g. Team Phoenix" />
            </Field>
            <Field label="Team Code">
              <Input value={autoCode} readOnly className="bg-muted/40 font-mono" />
            </Field>

            <Field label="Team Leader">
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Pick from counsellors" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_LEADERS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Parent Group">
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

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

          {/* Add team members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                Add Team Members
              </Label>
              <span className="text-xs text-muted-foreground">
                {members.length} selected
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9 text-sm"
                placeholder="Search counsellors by name or ID"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
            </div>
            <div className="max-h-60 overflow-y-auto rounded-xl border border-border bg-background/40 scrollbar-thin">
              {filteredMembers.map((c) => {
                const checked = members.includes(c.empId);
                return (
                  <button
                    key={c.empId}
                    type="button"
                    onClick={() => toggle(c.empId)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50",
                      checked && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {c.name
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.empId} · {c.designation}
                        </div>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border",
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
            Create Team
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
