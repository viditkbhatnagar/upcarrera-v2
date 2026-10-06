import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ScrollText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  GraduationCap,
  Briefcase,
  Info,
} from "lucide-react";
import { ApiError } from "@/lib/api";
import {
  listAdmissionRules,
  createAdmissionRule,
  updateAdmissionRule,
  deleteAdmissionRule,
  masterSettingsKeys,
  MIN_QUALIFICATION_LEVELS,
  type AdmissionRule,
  type AdmissionRuleInput,
} from "@/lib/api/master-settings";
import { useCourseOptions } from "@/components/applications/catalogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/administration/eligibility-rules")({
  head: () => ({ meta: [{ title: "Eligibility Rules — upCarrera" }] }),
  component: EligibilityRulesPage,
});

const NO_QUALIFICATION = "__none__";

const QUALIFICATION_LABELS: Record<string, string> = {
  "10th": "Class 10",
  "12th": "Class 12",
  diploma: "Diploma",
  ug: "Undergraduate",
  pg: "Postgraduate",
  doctorate: "Doctorate",
};

interface DraftState {
  id: number | null;
  course_id: string;
  min_qualification: string; // level code or NO_QUALIFICATION
  min_percentage: string;
  min_cgpa: string;
  requires_employment: boolean;
  min_experience_months: string;
  notes: string;
}

const emptyDraft = (): DraftState => ({
  id: null,
  course_id: "",
  min_qualification: NO_QUALIFICATION,
  min_percentage: "",
  min_cgpa: "",
  requires_employment: false,
  min_experience_months: "",
  notes: "",
});

/** Parse a numeric field: blank -> null, else the number (null on garbage). */
function numOrNull(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function EligibilityRulesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft());
  const [confirmDelete, setConfirmDelete] = useState<AdmissionRule | null>(null);

  const rulesQuery = useQuery({
    queryKey: masterSettingsKeys.rules(),
    queryFn: () => listAdmissionRules(),
  });
  const courses = useCourseOptions(undefined);

  const rules = rulesQuery.data?.items ?? [];
  const ruledCourseIds = useMemo(
    () => new Set(rules.map((r) => String(r.course_id))),
    [rules],
  );
  // Courses available to ADD a rule for (exclude those that already have one).
  const availableCourses = useMemo(
    () => courses.options.filter((o) => !ruledCourseIds.has(o.value)),
    [courses.options, ruledCourseIds],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: masterSettingsKeys.rules() });

  const saveMutation = useMutation({
    mutationFn: (payload: { id: number | null; body: AdmissionRuleInput }) =>
      payload.id == null
        ? createAdmissionRule(payload.body)
        : updateAdmissionRule(payload.id, {
            min_qualification: payload.body.min_qualification,
            min_percentage: payload.body.min_percentage,
            min_cgpa: payload.body.min_cgpa,
            requires_employment: payload.body.requires_employment,
            min_experience_months: payload.body.min_experience_months,
            notes: payload.body.notes,
          }),
    onSuccess: () => {
      toast.success(draft.id == null ? "Rule added." : "Rule updated.");
      setDialogOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not save the rule."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdmissionRule(id),
    onSuccess: () => {
      toast.success("Rule removed.");
      setConfirmDelete(null);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not remove the rule."),
  });

  const openCreate = () => {
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (rule: AdmissionRule) => {
    setDraft({
      id: rule.id,
      course_id: String(rule.course_id),
      min_qualification: rule.min_qualification ?? NO_QUALIFICATION,
      min_percentage: rule.min_percentage != null ? String(rule.min_percentage) : "",
      min_cgpa: rule.min_cgpa != null ? String(rule.min_cgpa) : "",
      requires_employment: rule.requires_employment,
      min_experience_months:
        rule.min_experience_months != null ? String(rule.min_experience_months) : "",
      notes: rule.notes ?? "",
    });
    setDialogOpen(true);
  };

  const submit = () => {
    const courseId = Number(draft.course_id);
    if (draft.id == null && (!Number.isInteger(courseId) || courseId <= 0)) {
      toast.error("Choose a course.");
      return;
    }
    const body: AdmissionRuleInput = {
      course_id: courseId,
      min_qualification:
        draft.min_qualification === NO_QUALIFICATION ? null : draft.min_qualification,
      min_percentage: numOrNull(draft.min_percentage),
      min_cgpa: numOrNull(draft.min_cgpa),
      requires_employment: draft.requires_employment,
      min_experience_months: draft.requires_employment
        ? numOrNull(draft.min_experience_months)
        : null,
      notes: draft.notes.trim() ? draft.notes.trim() : null,
    };
    saveMutation.mutate({ id: draft.id, body });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Master Settings
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            <ScrollText className="h-6 w-6 text-primary" /> Eligibility Rules
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Machine-checkable admission criteria per course. These drive the applicant’s inline
            eligibility result and decide whether the Employment section is collected.
          </p>
        </div>
        <Button onClick={openCreate} disabled={courses.isLoading || availableCourses.length === 0}>
          <Plus className="h-4 w-4" /> Add rule
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {rulesQuery.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : rulesQuery.isError ? (
          <div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {rulesQuery.error instanceof ApiError
              ? rulesQuery.error.message
              : "Could not load the rules."}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
              <GraduationCap className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold text-foreground">No eligibility rules yet</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add a rule to a course to publish its minimum qualification, score and employment
              requirements. Courses with no rule show “needs review” to the applicant.
            </p>
            <Button variant="outline" size="sm" onClick={openCreate} disabled={availableCourses.length === 0}>
              <Plus className="h-4 w-4" /> Add rule
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Min qualification</TableHead>
                <TableHead className="text-center">Min %</TableHead>
                <TableHead className="text-center">Min CGPA</TableHead>
                <TableHead>Employment</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium text-foreground">
                    {rule.course_title ?? `Course ${rule.course_id}`}
                  </TableCell>
                  <TableCell>
                    {rule.min_qualification
                      ? QUALIFICATION_LABELS[rule.min_qualification] ?? rule.min_qualification
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {rule.min_percentage != null ? `${rule.min_percentage}%` : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {rule.min_cgpa != null ? rule.min_cgpa : "—"}
                  </TableCell>
                  <TableCell>
                    {rule.requires_employment ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Badge>
                          <Briefcase className="mr-1 h-3 w-3" /> Required
                        </Badge>
                        {rule.min_experience_months != null && (
                          <span className="text-xs text-muted-foreground">
                            {rule.min_experience_months} mo
                          </span>
                        )}
                      </span>
                    ) : (
                      <Badge variant="secondary">Not required</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {rule.notes ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDelete(rule)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id == null ? "Add eligibility rule" : "Edit eligibility rule"}</DialogTitle>
            <DialogDescription>
              Minimums are compared against the applicant’s highest qualification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {draft.id == null ? (
              <div className="space-y-1.5">
                <Label htmlFor="er-course">Course</Label>
                <Select
                  value={draft.course_id || undefined}
                  onValueChange={(v) => setDraft((p) => ({ ...p, course_id: v }))}
                >
                  <SelectTrigger id="er-course">
                    <SelectValue placeholder="Select a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCourses.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Course: </span>
                <span className="font-medium text-foreground">
                  {rules.find((r) => r.id === draft.id)?.course_title ?? `Course ${draft.course_id}`}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="er-qual">Minimum qualification</Label>
              <Select
                value={draft.min_qualification}
                onValueChange={(v) => setDraft((p) => ({ ...p, min_qualification: v }))}
              >
                <SelectTrigger id="er-qual">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_QUALIFICATION}>No minimum</SelectItem>
                  {MIN_QUALIFICATION_LEVELS.map((lvl) => (
                    <SelectItem key={lvl} value={lvl}>
                      {QUALIFICATION_LABELS[lvl] ?? lvl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="er-pct">Minimum %</Label>
                <Input
                  id="er-pct"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={draft.min_percentage}
                  placeholder="e.g. 50"
                  onChange={(e) => setDraft((p) => ({ ...p, min_percentage: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="er-cgpa">Minimum CGPA</Label>
                <Input
                  id="er-cgpa"
                  type="number"
                  min={0}
                  max={10}
                  step="0.01"
                  value={draft.min_cgpa}
                  placeholder="e.g. 6.5"
                  onChange={(e) => setDraft((p) => ({ ...p, min_cgpa: e.target.value }))}
                />
              </div>
            </div>
            <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" /> Set the one that matches how this course scores
              applicants; leave the other blank.
            </p>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <Label htmlFor="er-emp" className="cursor-pointer">
                  Requires employment
                </Label>
                <p className="text-xs text-muted-foreground">
                  Collects the Employment section on the form.
                </p>
              </div>
              <Switch
                id="er-emp"
                checked={draft.requires_employment}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, requires_employment: v }))}
              />
            </div>

            {draft.requires_employment && (
              <div className="space-y-1.5">
                <Label htmlFor="er-exp">Minimum experience (months)</Label>
                <Input
                  id="er-exp"
                  type="number"
                  min={0}
                  max={900}
                  value={draft.min_experience_months}
                  placeholder="e.g. 12"
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, min_experience_months: e.target.value }))
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="er-notes">Notes</Label>
              <Textarea
                id="er-notes"
                rows={2}
                value={draft.notes}
                placeholder="Internal note (optional)"
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {draft.id == null ? "Add rule" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDelete != null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this rule?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.course_title ?? "This course"} will fall back to “needs review” for
              every applicant until a new rule is set.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
