import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  copyFeeStructure,
  copyIntake,
  deleteFeeStructure,
  expireFeeStructure,
  feeStructureKeys,
  listIntakes,
  type CopyIntakeResult,
  type FeeStructureListItem,
} from "@/lib/api/fee-structures";

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

/** Bulk copy every Active/Expired structure of one intake into another, as drafts. */
export function CopyIntakeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [result, setResult] = useState<CopyIntakeResult | null>(null);

  const intakes = useQuery({ queryKey: ["intakes", "v2"], queryFn: listIntakes });
  const options = intakes.data?.items ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      copyIntake({ from_intake_id: Number(from), to_intake_id: Number(to) }),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: feeStructureKeys.all });
      toast.success(
        res.created > 0
          ? `Copied ${res.created} fee structure${res.created === 1 ? "" : "s"}.`
          : "Nothing to copy — all target structures already exist.",
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reset = () => {
    setFrom("");
    setTo("");
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const canRun = from !== "" && to !== "" && from !== to && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy an intake&apos;s fee structures</DialogTitle>
          <DialogDescription>
            Clones every Active or Expired structure of the source intake into the target as new
            Drafts. Structures that already exist for the target are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">From intake</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue placeholder="Source intake" />
              </SelectTrigger>
              <SelectContent>
                {options.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name ?? `Intake #${i.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To intake</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder="Target intake" />
              </SelectTrigger>
              <SelectContent>
                {options
                  .filter((i) => String(i.id) !== from)
                  .map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name ?? `Intake #${i.id}`}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {result && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {result.created} created
            </div>
            {result.skipped.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {result.skipped.length} skipped
                </div>
                <ul className="max-h-32 space-y-0.5 overflow-auto text-xs text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={`${s.university_id}-${s.course_id}`}>
                      {s.university ?? `University #${s.university_id}`} ·{" "}
                      {s.course ?? `Course #${s.course_id}`} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {result ? "Close" : "Cancel"}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canRun}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Copy structures
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Copy one structure into an explicitly chosen target intake (MEDIUM-3). The list
 * opens this when "Copy to next intake" cannot auto-resolve a later intake — e.g.
 * production intakes with NULL start_dates — so the feature stays usable. Pre-seeds
 * the picker with the auto-suggested intake when the server offered one.
 */
export function CopyToIntakeDialog({
  item,
  open,
  onClose,
  suggestedIntakeId,
}: {
  item: FeeStructureListItem | null;
  open: boolean;
  onClose: () => void;
  suggestedIntakeId?: number | null;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<string>("");

  const intakes = useQuery({ queryKey: ["intakes", "v2"], queryFn: listIntakes });
  const options = (intakes.data?.items ?? []).filter((i) => i.id !== item?.intake_id);

  useEffect(() => {
    if (open) setTarget(suggestedIntakeId ? String(suggestedIntakeId) : "");
  }, [open, suggestedIntakeId]);

  const mutation = useMutation({
    mutationFn: () => copyFeeStructure(item!.id, Number(target)),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: feeStructureKeys.all });
      toast.success(
        `Copied ${item?.code ?? "fee structure"} to ${res.intake_name ?? "the chosen intake"} as ${
          res.code ?? "a new draft"
        }.`,
      );
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const canRun = target !== "" && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy {item?.code ?? "fee structure"} to an intake</DialogTitle>
          <DialogDescription>
            Choose the intake to copy this structure into. It is created as a new Draft; a structure
            that already exists for that intake is rejected.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Target intake</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an intake" />
            </SelectTrigger>
            <SelectContent>
              {options.map((i) => (
                <SelectItem key={i.id} value={String(i.id)}>
                  {i.name ?? `Intake #${i.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canRun}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Copy to intake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Expire an active structure, with an optional audited reason. */
export function ExpireDialog({
  item,
  open,
  onClose,
}: {
  item: FeeStructureListItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => expireFeeStructure(item!.id, reason.trim() || undefined),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: feeStructureKeys.all });
      toast.success(`${res.code ?? "Fee structure"} expired.`);
      setReason("");
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Expire {item?.code ?? "fee structure"}?</DialogTitle>
          <DialogDescription>
            Expiring is terminal. Recorded payments keep their snapshot amount; no new application
            can resolve this structure. To offer it again, copy it to a new intake.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Reason (optional, audited)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Intake closed; superseded by the next batch"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Expire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Delete a Draft structure (hard delete, with an audit snapshot server-side). */
export function DeleteDialog({
  item,
  open,
  onClose,
}: {
  item: FeeStructureListItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteFeeStructure(item!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: feeStructureKeys.all });
      toast.success(`${item?.code ?? "Draft"} deleted.`);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {item?.code ?? "this draft"}?</DialogTitle>
          <DialogDescription>
            Only Drafts can be deleted, and this cannot be undone. The row and its items and
            instalments are removed, with an audit snapshot kept.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Delete draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
