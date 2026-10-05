import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPatch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { isAcceptablePhoneInput } from "./phone";

/* ---------------------------------------------------------------------------
 * Shared by the Counsellors list and the Counsellor profile (QA C03 / C06).
 *
 * Edit follows the pattern that closed the universities/courses/intakes
 * data-corruption bug: the form is SEEDED FROM THE RAW SERVER ROW (never from a
 * display string such as "—" or a formatted phone) and the PATCH carries ONLY
 * the fields the operator changed. An untouched legacy phone like "97454003222"
 * is therefore never re-sent, so it cannot block an unrelated edit, and nothing
 * the screen derived for display can leak into the database.
 * ------------------------------------------------------------------------- */

/** The raw users row as GET /consultants and GET /consultants/:id/performance return it. */
export interface ConsultantRaw {
  id: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  code?: number | null;
  gender?: string | null;
  dob?: string | null;
  doj?: string | null;
  highest_qualification?: string | null;
  status?: number | null;
  employee_code?: string | null;
  team_id?: number | null;
  team_name?: string | null;
  reports_to?: number | null;
}

/* ---------------- shared option sources ---------------- */

interface ApiSalesTeam {
  id: number;
  name: string | null;
  leader: string | null;
  leader_name?: string | null;
  group_id?: number | null;
  status?: number | null;
}

interface ApiGroup {
  id: number;
  name: string | null;
  manager_id?: number | null;
  manager?: string | null;
}

interface ConsultantsListResponse {
  items: ConsultantRaw[];
  total: number;
}

/** Same key + request as the Teams screen, so the cache and its invalidations are shared. */
export function useSalesTeams() {
  return useQuery({
    queryKey: ["sales-teams", "list"],
    queryFn: () => apiGet<{ items: ApiSalesTeam[] }>("/sales-teams", { limit: 1000 }),
    staleTime: 60 * 1000,
  });
}

/** Same key + request as the Counsellors and Teams screens. */
export function useConsultantsList() {
  return useQuery({
    queryKey: ["consultants", "list"],
    queryFn: () => apiGet<ConsultantsListResponse>("/consultants", { limit: 1000 }),
  });
}

function useGroups() {
  return useQuery({
    queryKey: ["consultants", "groups"],
    queryFn: () => apiGet<{ items: ApiGroup[] }>("/consultants/groups"),
    staleTime: 5 * 60 * 1000,
  });
}

export interface TeamOption {
  id: number;
  name: string;
  leaderId: number | null;
  managerId: number | null;
}

export interface PersonOption {
  id: number;
  label: string;
}

/**
 * Teams, and the people a counsellor can report to: team leaders, group
 * managers and counsellors — all from live data, never the prototype lists.
 */
export function useHierarchyOptions(excludeUserId?: number) {
  const teamsQ = useSalesTeams();
  const groupsQ = useGroups();
  const consultantsQ = useConsultantsList();

  const teams = useMemo<TeamOption[]>(() => {
    const managerByGroup = new Map(
      (groupsQ.data?.items ?? []).map((g) => [g.id, g.manager_id ?? null]),
    );
    return (teamsQ.data?.items ?? [])
      .filter((t) => t.status !== 0)
      .map((t) => {
        const leader = Number(t.leader);
        return {
          id: t.id,
          name: t.name?.trim() || `Team #${t.id}`,
          leaderId: Number.isInteger(leader) && leader > 0 ? leader : null,
          managerId: t.group_id != null ? (managerByGroup.get(t.group_id) ?? null) : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teamsQ.data, groupsQ.data]);

  const people = useMemo<PersonOption[]>(() => {
    const roles = new Map<number, { name: string; hints: string[] }>();
    const add = (id: number | null | undefined, name: string | null | undefined, hint?: string) => {
      if (!id || id === excludeUserId) return;
      const entry = roles.get(id) ?? { name: name?.trim() || `User #${id}`, hints: [] };
      if (name?.trim()) entry.name = name.trim();
      if (hint && !entry.hints.includes(hint)) entry.hints.push(hint);
      roles.set(id, entry);
    };
    for (const g of groupsQ.data?.items ?? []) {
      add(g.manager_id, g.manager, `Manager · ${g.name ?? `Group #${g.id}`}`);
    }
    for (const t of teamsQ.data?.items ?? []) {
      const leader = Number(t.leader);
      if (Number.isInteger(leader) && leader > 0) {
        add(leader, t.leader_name, `Team Leader · ${t.name ?? `Team #${t.id}`}`);
      }
    }
    for (const c of consultantsQ.data?.items ?? []) add(c.id, c.name);

    return [...roles.entries()]
      .map(([id, r]) => ({ id, label: r.hints.length ? `${r.name} (${r.hints.join(", ")})` : r.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [groupsQ.data, teamsQ.data, consultantsQ.data, excludeUserId]);

  return {
    teams,
    people,
    isLoading: teamsQ.isLoading || groupsQ.isLoading || consultantsQ.isLoading,
    isError: teamsQ.isError,
  };
}

/** Who a counsellor in `team` reports to by default: its leader, else its group manager. */
export function defaultReportsTo(team: TeamOption | undefined, selfId?: number): number | null {
  if (!team) return null;
  if (team.leaderId && team.leaderId !== selfId) return team.leaderId;
  if (team.managerId && team.managerId !== selfId) return team.managerId;
  return null;
}

/* ---------------- Team + Reports-to fields ---------------- */

export function TeamReportsToFields({
  teams,
  people,
  teamId,
  reportsTo,
  onTeamChange,
  onReportsToChange,
  disabled,
}: {
  teams: TeamOption[];
  people: PersonOption[];
  teamId: string;
  reportsTo: string;
  onTeamChange: (v: string) => void;
  onReportsToChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Field label="Team" required>
        <Select value={teamId} onValueChange={onTeamChange} disabled={disabled || teams.length === 0}>
          <SelectTrigger>
            <SelectValue placeholder={teams.length === 0 ? "No teams exist yet" : "Select team"} />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Reports To" required>
        <Select value={reportsTo} onValueChange={onReportsToChange} disabled={disabled || people.length === 0}>
          <SelectTrigger>
            <SelectValue placeholder="Select team leader or manager" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

/* ---------------- Edit Counsellor ---------------- */

interface EditForm {
  name: string;
  username: string;
  email: string;
  phone: string;
  employee_code: string;
  gender: string;
  dob: string;
  doj: string;
  highest_qualification: string;
  status: "Active" | "Inactive";
}

const EMPLOYEE_CODE = /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/;

function day(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : "";
}

/** Seed strictly from raw server values. */
function seedEditForm(c: ConsultantRaw): EditForm {
  return {
    name: c.name ?? "",
    username: c.username ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    employee_code: c.employee_code ?? "",
    gender: c.gender ?? "",
    dob: day(c.dob),
    doj: day(c.doj),
    highest_qualification: c.highest_qualification ?? "",
    status: c.status === 1 ? "Active" : "Inactive",
  };
}

/** Only the fields that differ from the seed, in UpdateConsultantDto shape. */
function diffEditForm(seed: EditForm, form: EditForm): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  (Object.keys(form) as (keyof EditForm)[]).forEach((key) => {
    const next = form[key].trim();
    if (next === seed[key].trim()) return;
    body[key] = key === "status" ? (next === "Active" ? 1 : 0) : next;
  });
  return body;
}

export function EditCounsellorDialog({
  open,
  onOpenChange,
  consultant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consultant: ConsultantRaw | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted per open, so the form re-seeds from the latest server row. */}
        {consultant ? (
          <EditCounsellorForm
            key={consultant.id}
            consultant={consultant}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditCounsellorForm({
  consultant,
  onDone,
}: {
  consultant: ConsultantRaw;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const seed = useMemo(() => seedEditForm(consultant), [consultant]);
  const [form, setForm] = useState<EditForm>(seed);
  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const changes = useMemo(() => diffEditForm(seed, form), [seed, form]);
  const changed = Object.keys(changes).length > 0;

  const errors = {
    name: "name" in changes && form.name.trim() === "" ? "Name is required." : null,
    username:
      "username" in changes && form.username.trim() === "" ? "Username is required." : null,
    phone:
      "phone" in changes && !isAcceptablePhoneInput(form.phone)
        ? "Enter a 10-digit Indian mobile (e.g. 98765 43210) or an international number starting with +."
        : null,
    employee_code:
      "employee_code" in changes &&
      form.employee_code.trim() !== "" &&
      !EMPLOYEE_CODE.test(form.employee_code.trim())
        ? "Letters, digits, - _ / only, no spaces."
        : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch(`/consultants/${consultant.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultants"] });
      qc.invalidateQueries({ queryKey: ["consultant"] });
      toast.success("Counsellor updated");
      onDone();
    },
    // 409 carries the API's own text ("Employee code UC-7 is already assigned to …").
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn’t update the counsellor"),
  });

  const canSubmit = changed && !hasErrors && !mut.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold">Edit Counsellor</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Only the fields you change are saved. Use Transfer Team to change the team.
        </p>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
        <Field label="Name" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Employee Code" error={errors.employee_code}>
          <Input
            placeholder={`Blank shows UC-${consultant.id}`}
            value={form.employee_code}
            onChange={(e) => set("employee_code", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone Number" error={errors.phone}>
          <Input
            placeholder="98765 43210"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field label="Username" required error={errors.username}>
          <Input
            autoComplete="off"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
          />
        </Field>
        <Field label="Gender">
          <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date of Birth">
          <Input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
        </Field>
        <Field label="Joining Date">
          <Input type="date" value={form.doj} onChange={(e) => set("doj", e.target.value)} />
        </Field>
        <Field label="Highest Qualification">
          <Input
            value={form.highest_qualification}
            onChange={(e) => set("highest_qualification", e.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select value={form.status} onValueChange={(v) => set("status", v as EditForm["status"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <DialogFooter className="gap-2">
        <SecondaryButton onClick={onDone} disabled={mut.isPending}>
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={() => canSubmit && mut.mutate(changes)} disabled={!canSubmit}>
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {mut.isPending ? "Saving…" : changed ? "Save Changes" : "No Changes"}
        </PrimaryButton>
      </DialogFooter>
    </>
  );
}

/* ---------------- Transfer Team ---------------- */

export function TransferTeamDialog({
  open,
  onOpenChange,
  consultant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  consultant: ConsultantRaw | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {consultant ? (
          <TransferTeamForm
            key={consultant.id}
            consultant={consultant}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TransferTeamForm({
  consultant,
  onDone,
}: {
  consultant: ConsultantRaw;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { teams, people, isLoading, isError } = useHierarchyOptions(consultant.id);

  const initialTeam = consultant.team_id ? String(consultant.team_id) : "";
  const initialReportsTo = consultant.reports_to ? String(consultant.reports_to) : "";
  const [teamId, setTeamId] = useState(initialTeam);
  const [reportsTo, setReportsTo] = useState(initialReportsTo);

  const teamById = useMemo(() => new Map(teams.map((t) => [String(t.id), t])), [teams]);

  // Moving to a team proposes its leader (or group manager) as the new line
  // manager, unless the operator already picked someone else by hand.
  const changeTeam = (next: string) => {
    const previousDefault = defaultReportsTo(teamById.get(teamId), consultant.id);
    if (reportsTo === "" || reportsTo === String(previousDefault ?? "")) {
      const proposed = defaultReportsTo(teamById.get(next), consultant.id);
      setReportsTo(proposed ? String(proposed) : "");
    }
    setTeamId(next);
  };

  const mut = useMutation({
    mutationFn: () =>
      apiPatch(`/consultants/${consultant.id}/team`, {
        team_id: Number(teamId),
        reports_to: Number(reportsTo),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consultants"] });
      qc.invalidateQueries({ queryKey: ["consultant"] });
      qc.invalidateQueries({ queryKey: ["sales-teams"] });
      toast.success(
        `${consultant.name?.trim() || "Counsellor"} moved to ${teamById.get(teamId)?.name ?? "the team"}`,
      );
      onDone();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn’t transfer the counsellor"),
  });

  const changed = teamId !== initialTeam || reportsTo !== initialReportsTo;
  const canSubmit = teamId !== "" && reportsTo !== "" && changed && !mut.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-semibold">Transfer Team</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {consultant.name?.trim() || "This counsellor"} is currently in{" "}
          <span className="font-semibold text-foreground">
            {consultant.team_name?.trim() || "no team"}
          </span>
          . A counsellor belongs to exactly one team.
        </p>
      </DialogHeader>

      {isError ? (
        <p className="py-4 text-sm text-rose-600">Couldn’t load teams. Close and try again.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading teams…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 py-2">
          <TeamReportsToFields
            teams={teams}
            people={people}
            teamId={teamId}
            reportsTo={reportsTo}
            onTeamChange={changeTeam}
            onReportsToChange={setReportsTo}
            disabled={mut.isPending}
          />
          {teams.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No teams exist yet. Create one under Counsellor Management → Teams first.
            </p>
          ) : null}
        </div>
      )}

      <DialogFooter className="gap-2">
        <SecondaryButton onClick={onDone} disabled={mut.isPending}>
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={() => canSubmit && mut.mutate()} disabled={!canSubmit}>
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRightLeft className="h-4 w-4" />
          )}
          {mut.isPending ? "Transferring…" : "Transfer"}
        </PrimaryButton>
      </DialogFooter>
    </>
  );
}

/* ---------------- small UI ---------------- */

export function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-rose-500">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? <p className="text-[11px] font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
