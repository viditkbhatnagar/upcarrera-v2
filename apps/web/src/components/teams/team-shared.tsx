/**
 * Shared types, labels and pickers for the Teams / Team Profile / Groups
 * screens (QA T02, T04, G01, G02).
 *
 * Kept outside the route files because TanStack Router's autoCodeSplitting
 * splits route modules, so components exported from one route cannot be
 * imported by another.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const EMPTY = "—";

/* ---------------- Team status ---------------- */

export type TeamStatus = "Active" | "Inactive";

/**
 * Legacy sales_team.status is an Int code where only 1 means active; there is
 * no on-leave team. Any other code (0, 2, null, ...) reads as Inactive. Shared
 * by the Teams list and the Team Profile so both screens agree on a row.
 */
export function mapTeamStatus(status: number | string | null | undefined): TeamStatus {
  const code = typeof status === "string" ? Number(status) : status;
  return code === 1 ? "Active" : "Inactive";
}

/* ---------------- API shapes ---------------- */

/** One entry of GET /sales-teams[/:id] `members_details` (SalesService.decorateTeams). */
export interface ApiMemberDetail {
  id: number;
  /** null when the user does not exist or is soft-deleted. */
  name: string | null;
  email: string | null;
  phone: string | null;
  employee_code?: string | null;
}

/** A sales_team row as GET /sales-teams and GET /sales-teams/:id return it. */
export interface ApiSalesTeam {
  id: number;
  name: string | null;
  /** users.id as a VarChar — NOT a display name. */
  leader: string | null;
  members: unknown[] | null;
  members_details?: ApiMemberDetail[] | null;
  members_count?: number | null;
  leader_name?: string | null;
  group_id?: number | null;
  group_name?: string | null;
  group_code?: string | null;
  university_id?: string | null;
  course_id?: string | null;
  status: number | null;
  created_at?: string | null;
}

export interface SalesTeamsResponse {
  items: ApiSalesTeam[];
  total: number;
  page: number;
  limit: number;
}

/** A counsellor row from GET /consultants (only the fields these screens read). */
export interface ApiConsultant {
  id: number;
  name: string | null;
  email: string | null;
  employee_code?: string | null;
  status?: number | null;
  team_id?: number | null;
  team_name?: string | null;
}

export interface ConsultantsResponse {
  items: ApiConsultant[];
  total: number;
  page: number;
  limit: number;
}

/** One row of GET /consultants/groups (counsellor_group, migration 001). */
export interface ApiGroup {
  id: number;
  code: string | null;
  name: string | null;
  manager_id: number | null;
  manager: string | null;
  total_teams: number;
  total_counsellors: number;
  status: number | null;
}

export interface GroupsResponse {
  items: ApiGroup[];
  total: number;
  total_counsellors: number;
  unassigned_counsellors: number;
}

/* ---------------- Queries ---------------- */

// Query keys are shared with counsellors.counsellors.tsx, which reads the same
// endpoints with the same parameters, so the caches agree.
export const TEAMS_LIST_KEY = ["sales-teams", "list"] as const;
export const CONSULTANTS_LIST_KEY = ["consultants", "list"] as const;
export const GROUPS_KEY = ["consultants", "groups"] as const;

export function useTeamsList() {
  return useQuery({
    queryKey: TEAMS_LIST_KEY,
    queryFn: () => apiGet<SalesTeamsResponse>("/sales-teams", { limit: 1000 }),
  });
}

export function useConsultantsList() {
  return useQuery({
    queryKey: CONSULTANTS_LIST_KEY,
    queryFn: () => apiGet<ConsultantsResponse>("/consultants", { limit: 1000 }),
  });
}

export function useGroupsList() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: () => apiGet<GroupsResponse>("/consultants/groups"),
  });
}

/* ---------------- Labels ---------------- */

/** The display code for a team. Display only — never parse it back for a request. */
export function teamCode(id: number): string {
  return `TM-${String(id).padStart(4, "0")}`;
}

/** Placeholder for an id that resolves to no user. Never a bare number. */
export function unknownUser(id: number | string): string {
  return `Unknown user #${id}`;
}

/** A person's name, or an explicit "Unknown user #id" when it did not resolve. */
export function personLabel(name: string | null | undefined, id: number): string {
  return name && name.trim() !== "" ? name.trim() : unknownUser(id);
}

/** Employee code as the Counsellors screen shows it: employee_code, else UC-<id>. */
export function displayEmpId(code: string | null | undefined, id: number): string {
  return code && code.trim() !== "" ? code.trim() : `UC-${id}`;
}

const DIGITS = /^[1-9]\d*$/;

/**
 * The team leader as text. sales_team.leader is a users.id; leader_name is its
 * resolved name (null when the user is missing). In production both teams
 * point at users that do not exist, so this must never print the raw id.
 */
export function leaderLabel(t: Pick<ApiSalesTeam, "leader" | "leader_name">): string {
  if (t.leader_name && t.leader_name.trim() !== "") return t.leader_name.trim();
  const raw = t.leader?.trim();
  if (!raw) return EMPTY;
  return DIGITS.test(raw) ? unknownUser(raw) : `Unrecognised leader "${raw}"`;
}

export function groupLabel(
  t: Pick<ApiSalesTeam, "group_id" | "group_name">,
): string {
  if (t.group_name && t.group_name.trim() !== "") return t.group_name.trim();
  return t.group_id != null ? `Unknown group #${t.group_id}` : EMPTY;
}

export function groupDisplayName(g: Pick<ApiGroup, "id" | "name">): string {
  return g.name && g.name.trim() !== "" ? g.name.trim() : `Group #${g.id}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* ---------------- Sequential writes ---------------- */

export interface StepFailure {
  label: string;
  message: string;
}

/**
 * Run write steps ONE AT A TIME and collect what failed.
 *
 * Sequential on purpose: PATCH /consultants/:id/team rewrites the JSON roster
 * of every team it touches, so two concurrent calls against the same team
 * would each read the old roster and the second would undo the first.
 */
export async function runSteps(
  steps: { label: string; run: () => Promise<unknown> }[],
): Promise<StepFailure[]> {
  const failures: StepFailure[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (e) {
      failures.push({
        label: step.label,
        message: e instanceof Error ? e.message : "Request failed",
      });
    }
  }
  return failures;
}

export function describeFailures(failures: StepFailure[]): string {
  return failures.map((f) => `${f.label}: ${f.message}`).join("; ");
}

/* ---------------- CSV export ---------------- */

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

const CSV_REVOKE_DELAY_MS = 1000;

/** Download rows as a CSV file, client-side. */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 names (₹, non-Latin scripts) correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some Safari / Firefox builds start the download asynchronously; revoking
  // synchronously can cancel it or yield an empty file.
  setTimeout(() => URL.revokeObjectURL(url), CSV_REVOKE_DELAY_MS);
}

export function csvDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------- Form bits ---------------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Run `fn` once each time `open` turns true. Dialogs seed their form here
 * rather than in an effect keyed on the server row, so a background refetch
 * while the dialog is open cannot wipe what the operator has typed.
 */
export function useOnOpen(open: boolean, fn: () => void): void {
  const wasOpen = useRef(false);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (open && !wasOpen.current) latest.current();
    wasOpen.current = open;
  }, [open]);
}

/** Sentinel for "no value" in a Radix Select, which forbids an empty item value. */
export const NONE = "__none__";

/* ---------------- Member checklist ---------------- */

export interface ChecklistEntry {
  id: number;
  name: string;
  secondary: string;
  /** Extra note shown in amber, e.g. "In Team X — will move here". */
  note?: string;
  /** True for an id that resolves to no current counsellor. */
  orphan?: boolean;
}

/**
 * Searchable checklist of counsellors keyed on the numeric users.id. Used by
 * Create Team and Manage Members so member selection lives in one place.
 */
export function MemberChecklist({
  entries,
  selected,
  onToggle,
  loading,
  disabled = false,
  label = "Team Members",
}: {
  entries: ChecklistEntry[];
  selected: number[];
  onToggle: (id: number) => void;
  loading?: boolean;
  /** Locks the checklist (e.g. while a save is in flight) so no tick is lost. */
  disabled?: boolean;
  label?: string;
}) {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(s) ||
        e.secondary.toLowerCase().includes(s) ||
        String(e.id).includes(s),
    );
  }, [entries, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-foreground">{label}</Label>
        <span className="text-xs text-muted-foreground">{selected.length} selected</span>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-9 text-sm"
          placeholder="Search counsellors by name, ID or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-background/40 scrollbar-thin">
        {visible.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {loading ? "Loading counsellors…" : "No counsellors match this search."}
          </div>
        )}
        {visible.map((e) => {
          const checked = selected.includes(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onToggle(e.id)}
              disabled={disabled}
              aria-pressed={checked}
              className={cn(
                "flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
                checked && "bg-primary/5",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    e.orphan ? "bg-amber-500/10 text-amber-700" : "bg-primary/10 text-primary",
                  )}
                >
                  {e.orphan ? "?" : initials(e.name)}
                </div>
                <div className="min-w-0">
                  <div
                    className={cn(
                      "truncate text-sm font-medium",
                      e.orphan ? "italic text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {e.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{e.secondary}</div>
                  {e.note && <div className="truncate text-[11px] text-amber-700">{e.note}</div>}
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
  );
}

/** Build checklist entries from the counsellor list, flagging other-team members. */
export function consultantEntries(
  consultants: ApiConsultant[],
  currentTeamId: number | null,
): ChecklistEntry[] {
  return consultants.map((c) => {
    const inOther = c.team_id != null && c.team_id !== currentTeamId;
    return {
      id: c.id,
      name: personLabel(c.name, c.id),
      secondary: [displayEmpId(c.employee_code, c.id), c.email ?? null, c.status === 0 ? "Inactive" : null]
        .filter(Boolean)
        .join(" · "),
      note: inOther
        ? `In ${c.team_name?.trim() || `team #${c.team_id}`} — selecting moves them here`
        : undefined,
    };
  });
}
