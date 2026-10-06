/**
 * Edit Team / Manage Members / Transfer Team (QA T04).
 *
 * Used from the Teams list (row Edit) and the Team Profile header. Every write
 * goes to an endpoint that already exists, and every success message fires only
 * after the server has confirmed the write.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2, Save } from "lucide-react";
import { apiDelete, apiPatch, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  type ChecklistEntry,
  consultantEntries,
  describeFailures,
  displayEmpId,
  Field,
  groupDisplayName,
  groupLabel,
  leaderLabel,
  MemberChecklist,
  NONE,
  personLabel,
  runSteps,
  useConsultantsList,
  useGroupsList,
  useOnOpen,
} from "./team-shared";

/** Refresh everything a team write can change: team rows, counsellor rows, group counts. */
function useInvalidateTeams() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["sales-teams"] });
    qc.invalidateQueries({ queryKey: ["consultants"] });
  };
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError || e instanceof Error ? e.message : fallback;
}

const btnSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50";

/* ======================================================================
 * Edit Team — PATCH /sales-teams/:id
 * ==================================================================== */

/**
 * Form state seeded from the RAW server row. `leader` is the users.id string
 * (or NONE); `status` is the raw Int code as a string (or NONE), so a legacy
 * code that is neither 0 nor 1 survives an edit that did not touch it.
 */
interface TeamForm {
  name: string;
  leader: string;
  status: string;
}

export interface UpdateTeamBody {
  name?: string;
  leader?: string | null;
  status?: number;
}

export function seedTeamForm(t: ApiSalesTeam): TeamForm {
  const leader = t.leader?.trim();
  return {
    name: t.name ?? "",
    leader: leader ? leader : NONE,
    status: t.status == null ? NONE : String(t.status),
  };
}

/** Only the fields the operator actually changed. */
export function diffTeamForm(seed: TeamForm, form: TeamForm): UpdateTeamBody {
  const body: UpdateTeamBody = {};
  if (form.name.trim() !== seed.name.trim()) body.name = form.name.trim();
  if (form.leader !== seed.leader) body.leader = form.leader === NONE ? null : form.leader;
  if (form.status !== seed.status && form.status !== NONE) body.status = Number(form.status);
  return body;
}

export function EditTeamDialog({
  team: liveTeam,
  open,
  onOpenChange,
}: {
  team: ApiSalesTeam | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidateTeams();
  // Snapshot of the server row taken when the dialog opens. The seed and the
  // diff are computed against THIS, not the live prop, so a refetch while the
  // dialog is open cannot turn the operator's stale form values into
  // "changes" (e.g. reverting someone else's rename or roster edit).
  const [team, setTeam] = useState<ApiSalesTeam | null>(liveTeam);
  const { data: consultantsData, isLoading: consultantsLoading } = useConsultantsList();

  const seed = useMemo(() => (team ? seedTeamForm(team) : null), [team]);
  const [form, setForm] = useState<TeamForm>({ name: "", leader: NONE, status: NONE });

  // Re-seed on every open so a cancelled edit never leaks into the next one.
  useOnOpen(open, () => {
    setTeam(liveTeam);
    if (liveTeam) setForm(seedTeamForm(liveTeam));
  });

  const leaderOptions = useMemo(() => {
    const opts = (consultantsData?.items ?? [])
      .map((c) => ({
        value: String(c.id),
        label: `${personLabel(c.name, c.id)} · ${displayEmpId(c.employee_code, c.id)}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // The stored leader may not be a current counsellor (production's teams
    // point at users 30 and 31, which do not exist). Offer it so the field
    // shows what is stored instead of looking blank.
    if (seed && seed.leader !== NONE && !opts.some((o) => o.value === seed.leader) && team) {
      opts.unshift({ value: seed.leader, label: `${leaderLabel(team)} (current)` });
    }
    return opts;
  }, [consultantsData, seed, team]);

  const body = seed ? diffTeamForm(seed, form) : {};
  const changed = Object.keys(body).length > 0;
  const nameOk = form.name.trim() !== "";

  const mut = useMutation({
    mutationFn: (b: UpdateTeamBody) => apiPatch(`/sales-teams/${team?.id}`, b),
    onSuccess: () => {
      invalidate();
      toast.success("Team updated");
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorText(e, "Couldn’t update the team")),
  });

  const canSubmit = !!team && changed && nameOk && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Edit Team</DialogTitle>
          <DialogDescription>
            Rename the team, change its leader or its status. Members are managed separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Team Name">
            <Input
              value={form.name}
              maxLength={160}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              aria-invalid={!nameOk}
            />
          </Field>
          <Field label="Team Leader">
            <Select
              value={form.leader}
              onValueChange={(v) => setForm((f) => ({ ...f, leader: v }))}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={consultantsLoading ? "Loading counsellors…" : "Pick a counsellor"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No leader</SelectItem>
                {leaderOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
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
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {seed?.status === NONE && <SelectItem value={NONE}>Not set</SelectItem>}
                {seed && seed.status !== NONE && seed.status !== "1" && seed.status !== "0" && (
                  <SelectItem value={seed.status}>Code {seed.status} (current)</SelectItem>
                )}
                <SelectItem value="1">Active</SelectItem>
                <SelectItem value="0">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            className={btnSecondary}
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!canSubmit}
            onClick={() => canSubmit && mut.mutate(body)}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {mut.isPending ? "Saving…" : changed ? "Save Changes" : "No changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ======================================================================
 * Manage Members — PATCH /consultants/:id/team per change
 * ==================================================================== */

/** The ids currently on the roster, in roster order. */
function rosterIds(team: ApiSalesTeam): number[] {
  if (Array.isArray(team.members_details)) return team.members_details.map((m) => m.id);
  return (team.members ?? []).map((m) => Number(m)).filter((n) => Number.isInteger(n) && n > 0);
}

export function ManageMembersDialog({
  team: liveTeam,
  open,
  onOpenChange,
}: {
  team: ApiSalesTeam | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidateTeams();
  // Snapshot of the server row taken when the dialog opens. The seed and the
  // diff are computed against THIS, not the live prop, so a refetch while the
  // dialog is open cannot turn the operator's stale form values into
  // "changes" (e.g. reverting someone else's rename or roster edit).
  const [team, setTeam] = useState<ApiSalesTeam | null>(liveTeam);
  const { data: consultantsData, isLoading: consultantsLoading } = useConsultantsList();
  const consultants = useMemo(() => consultantsData?.items ?? [], [consultantsData]);

  const current = useMemo(() => (team ? rosterIds(team) : []), [team]);
  const [selected, setSelected] = useState<number[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useOnOpen(open, () => {
    setTeam(liveTeam);
    setSelected(liveTeam ? rosterIds(liveTeam) : []);
    setInlineError(null);
  });

  const entries = useMemo<ChecklistEntry[]>(() => {
    if (!team) return [];
    const byId = new Map(consultants.map((c) => [c.id, c]));
    const details = new Map((team.members_details ?? []).map((m) => [m.id, m]));

    // Roster ids that are not a current counsellor — the production rows are
    // all like this (users 30, 31, 41 do not exist). Listed first so they can
    // be taken off.
    const orphans: ChecklistEntry[] = current
      .filter((id) => !byId.has(id))
      .map((id) => {
        const d = details.get(id);
        const known = !!(d?.name && d.name.trim());
        return {
          id,
          name: personLabel(d?.name, id),
          secondary: known ? `${d?.email ?? "No email"} · not a counsellor account` : "No such user — untick to remove",
          orphan: !known,
        };
      });

    const all = consultantEntries(consultants, team.id);
    const onRoster = all.filter((e) => current.includes(e.id));
    const rest = all
      .filter((e) => !current.includes(e.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...orphans, ...onRoster, ...rest];
  }, [team, consultants, current]);

  const added = selected.filter((id) => !current.includes(id));
  const removed = current.filter((id) => !selected.includes(id));
  const changed = added.length + removed.length > 0;

  const mut = useMutation({
    mutationFn: async () => {
      if (!team) return { failures: [], total: 0 };
      const byId = new Map(consultants.map((c) => [c.id, c]));
      const nameOf = (id: number) =>
        personLabel(
          byId.get(id)?.name ?? team.members_details?.find((m) => m.id === id)?.name,
          id,
        );

      const steps = [
        ...added.map((id) => ({
          label: `Add ${nameOf(id)}`,
          run: () => apiPatch(`/consultants/${id}/team`, { team_id: team.id }),
        })),
        ...removed.map((id) => {
          const c = byId.get(id);
          // A real counsellor whose team is this one (or unset) is detached
          // through the counsellor endpoint, which keeps users.team_id and the
          // roster JSON in step. Anything else — an id with no user, or a user
          // who has since moved to another team — is taken off THIS roster
          // only, so nobody is detached from a team they actually belong to.
          const viaCounsellor = !!c && (c.team_id == null || c.team_id === team.id);
          return {
            label: `Remove ${nameOf(id)}`,
            run: () =>
              viaCounsellor
                ? apiPatch(`/consultants/${id}/team`, { team_id: null })
                : apiDelete(`/sales-teams/${team.id}/members/${id}`),
          };
        }),
      ];
      const failures = await runSteps(steps);
      return { failures, total: steps.length };
    },
    onSuccess: ({ failures, total }) => {
      invalidate();
      if (failures.length === 0) {
        const parts = [
          added.length ? `${added.length} added` : null,
          removed.length ? `${removed.length} removed` : null,
        ].filter(Boolean);
        toast.success(`Members updated (${parts.join(", ")})`);
        onOpenChange(false);
        return;
      }
      if (failures.length === total) {
        setInlineError(`Nothing was saved. ${describeFailures(failures)}`);
        return;
      }
      toast.warning(
        `Saved ${total - failures.length} of ${total} changes. Not saved — ${describeFailures(failures)}`,
      );
      onOpenChange(false);
    },
    onError: (e) => setInlineError(errorText(e, "Couldn’t update members")),
  });

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Manage Members</DialogTitle>
          <DialogDescription>
            A counsellor belongs to one team. Adding someone from another team moves them here.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <MemberChecklist
            entries={entries}
            selected={selected}
            onToggle={toggle}
            loading={consultantsLoading}
            disabled={mut.isPending}
          />
          {changed && (
            <p className="mt-2 text-xs text-muted-foreground">
              {added.length} to add · {removed.length} to remove
            </p>
          )}
        </div>

        {inlineError && <p className="text-sm text-rose-600">{inlineError}</p>}

        <DialogFooter className="gap-2">
          <button
            type="button"
            className={btnSecondary}
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!team || !changed || mut.isPending}
            onClick={() => {
              setInlineError(null);
              mut.mutate();
            }}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {mut.isPending ? "Saving…" : changed ? "Save Members" : "No changes"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ======================================================================
 * Transfer Team — PATCH /consultants/teams/:id/group
 * ==================================================================== */

export function TransferTeamDialog({
  team: liveTeam,
  open,
  onOpenChange,
}: {
  team: ApiSalesTeam | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const invalidate = useInvalidateTeams();
  // Snapshot of the server row taken when the dialog opens. The seed and the
  // diff are computed against THIS, not the live prop, so a refetch while the
  // dialog is open cannot turn the operator's stale form values into
  // "changes" (e.g. reverting someone else's rename or roster edit).
  const [team, setTeam] = useState<ApiSalesTeam | null>(liveTeam);
  const { data: groupsData, isLoading: groupsLoading } = useGroupsList();
  const groups = useMemo(() => groupsData?.items ?? [], [groupsData]);

  const seed = team?.group_id != null ? String(team.group_id) : NONE;
  const [value, setValue] = useState(seed);

  useOnOpen(open, () => {
    setTeam(liveTeam);
    setValue(liveTeam?.group_id != null ? String(liveTeam.group_id) : NONE);
  });

  const changed = value !== seed;
  const target = groups.find((g) => String(g.id) === value);

  const mut = useMutation({
    mutationFn: (groupId: number | null) =>
      apiPatch(`/consultants/teams/${team?.id}/group`, { group_id: groupId }),
    onSuccess: (_d, groupId) => {
      invalidate();
      toast.success(
        groupId === null
          ? "Team removed from its group"
          : `Team moved to ${target ? groupDisplayName(target) : "the selected group"}`,
      );
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorText(e, "Couldn’t transfer the team")),
  });

  const currentMissing = seed !== NONE && !groups.some((g) => String(g.id) === seed);

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Transfer Team</DialogTitle>
          <DialogDescription>
            Move this team under a different group. Its members stay with the team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">Current group: </span>
            <span className="font-semibold text-foreground">{team ? groupLabel(team) : "—"}</span>
          </div>
          <Field label="New Parent Group">
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger>
                <SelectValue placeholder={groupsLoading ? "Loading groups…" : "Pick a group"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No group</SelectItem>
                {currentMissing && team && (
                  <SelectItem value={seed}>{groupLabel(team)} (current)</SelectItem>
                )}
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
          {!groupsLoading && groups.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No groups exist yet. Create one on the Groups screen first.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            className={btnSecondary}
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!team || !changed || mut.isPending}
            onClick={() => mut.mutate(value === NONE ? null : Number(value))}
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="h-4 w-4" />
            )}
            {mut.isPending ? "Transferring…" : "Transfer"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
