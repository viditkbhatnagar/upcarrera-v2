import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  Plus,
  Search,
  Eye,
  Pencil,
  Users,
  UsersRound,
  Network,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  RefreshCcw,
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
  ALL_COUNSELLORS,
  TEAMS,
  GROUPS,
  MANAGERS,
  TEAM_LEADERS,
} from "@/lib/counsellors-data";

export const Route = createFileRoute("/counsellors/groups")({
  head: () => ({ meta: [{ title: "Groups — upCarrera" }] }),
  component: GroupsPage,
});

type GroupStatus = "Active" | "Inactive";

interface GroupRow {
  id: string;
  name: string;
  manager: string;
  totalTeams: number;
  totalCounsellors: number;
  activeTarget: number;
  status: GroupStatus;
}

const STATUS_STYLES: Record<GroupStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
};
const STATUS_DOT: Record<GroupStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
};

// Synthesize team rows so totals reconcile with Teams module
const TEAM_DEFS = TEAMS.map((t, i) => {
  const members = ALL_COUNSELLORS.filter((c) => c.team === t);
  return {
    id: `TM-${String(2001 + i).padStart(4, "0")}`,
    name: `Team ${t}`,
    group: GROUPS[i % GROUPS.length],
    members,
    target: members.reduce((s, m) => s + m.activeTarget, 0),
  };
});

const ALL_GROUPS: GroupRow[] = GROUPS.map((g, i) => {
  const groupTeams = TEAM_DEFS.filter((t) => t.group === g);
  const totalCounsellors = groupTeams.reduce(
    (s, t) => s + t.members.length,
    0,
  );
  const activeTarget = groupTeams.reduce((s, t) => s + t.target, 0);
  return {
    id: `GR-${String(3001 + i).padStart(4, "0")}`,
    name: `${g} Region`,
    manager: MANAGERS[i % MANAGERS.length],
    totalTeams: groupTeams.length,
    totalCounsellors,
    activeTarget,
    status: i === 4 ? "Inactive" : "Active",
  };
});

type StatusFilter = GroupStatus | "All";

function GroupsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    return ALL_GROUPS.filter((g) => {
      if (statusFilter !== "All" && g.status !== statusFilter) return false;
      if (managerFilter !== "All" && g.manager !== managerFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !g.name.toLowerCase().includes(s) &&
          !g.id.toLowerCase().includes(s) &&
          !g.manager.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [statusFilter, search, managerFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const totals = useMemo(() => {
    const active = ALL_GROUPS.filter((g) => g.status === "Active").length;
    const totalTeams = TEAM_DEFS.length;
    const totalCounsellors = ALL_COUNSELLORS.length;
    return { active, totalTeams, totalCounsellors };
  }, []);

  const resetFilters = () => {
    setStatusFilter("All");
    setSearch("");
    setManagerFilter("All");
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
            Groups
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage multiple teams.
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
            Create Group
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Network}
          label="Total Groups"
          value={ALL_GROUPS.length}
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
          label="Total Teams"
          value={totals.totalTeams}
          accent="bg-indigo-500/10 text-indigo-600"
        />
        <KpiCard
          icon={Users}
          label="Total Counsellors"
          value={totals.totalCounsellors}
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
              placeholder="Search group, ID, manager"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={managerFilter} onValueChange={setManagerFilter}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Manager" />
            </SelectTrigger>
            <SelectContent>
              {["All", ...MANAGERS].map((m) => (
                <SelectItem key={m} value={m}>
                  {m === "All" ? "All Managers" : m}
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
            {filtered.length.toLocaleString()} groups
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
            Sorted by <span className="font-medium text-foreground">Group ID</span>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          {pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Network className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No groups found</div>
              <div className="text-xs text-muted-foreground">
                Try adjusting your filters or create a new group.
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold w-16">Sl No</th>
                  <th className="px-4 py-2.5 font-semibold">Group ID</th>
                  <th className="px-4 py-2.5 font-semibold">Group Name</th>
                  <th className="px-4 py-2.5 font-semibold">Manager</th>
                  <th className="px-4 py-2.5 font-semibold">Total Teams</th>
                  <th className="px-4 py-2.5 font-semibold">Total Counsellors</th>
                  <th className="px-4 py-2.5 font-semibold">Active Target</th>
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
                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {g.id}
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
                    <td className="px-4 py-3 text-sm text-foreground">{g.manager}</td>
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
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">
                      {g.activeTarget.toLocaleString()}
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
                        <IconBtn icon={Eye} label="View" />
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

      <CreateGroupDialog open={openCreate} onOpenChange={setOpenCreate} />
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

function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const autoCode = useMemo(
    () => `GR-${String(3000 + ALL_GROUPS.length + 1).padStart(4, "0")}`,
    [],
  );
  const [teams, setTeams] = useState<string[]>([]);
  const [teamSearch, setTeamSearch] = useState("");

  // Group Manager pool: managers + team leaders (both are senior counsellors)
  const managerPool = useMemo(
    () => Array.from(new Set([...MANAGERS, ...TEAM_LEADERS])),
    [],
  );

  const filteredTeams = useMemo(() => {
    const s = teamSearch.toLowerCase();
    return TEAM_DEFS.filter(
      (t) =>
        !s ||
        t.name.toLowerCase().includes(s) ||
        t.id.toLowerCase().includes(s) ||
        t.group.toLowerCase().includes(s),
    );
  }, [teamSearch]);

  const toggle = (id: string) =>
    setTeams((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Create Group</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Set up a new group and assign teams under a group manager.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Group Name">
              <Input placeholder="e.g. North Region" />
            </Field>
            <Field label="Group Code">
              <Input value={autoCode} readOnly className="bg-muted/40 font-mono" />
            </Field>

            <Field label="Group Manager">
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Pick from counsellors" />
                </SelectTrigger>
                <SelectContent>
                  {managerPool.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
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

          {/* Assign Teams */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                Assign Teams
              </Label>
              <span className="text-xs text-muted-foreground">
                {teams.length} selected
              </span>
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
              {filteredTeams.map((t) => {
                const checked = teams.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50",
                      checked && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <UsersRound className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {t.id} · {t.members.length} counsellors · {t.group}
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
            Create Group
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
