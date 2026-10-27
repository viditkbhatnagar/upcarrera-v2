// Modal opened by the "+" next to the External Referee picker. Saves through
// POST /external-referees and hands the new referee back so it is selected.

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import {
  type ExternalReferee,
  type ExternalRefereeInput,
  validateReferee,
} from "./lead-references";
import { useAddExternalReferee } from "./referees";

const EMPTY: ExternalRefereeInput = { name: "", email: "", phone: "", state: "", district: "" };

const FIELDS: ReadonlyArray<readonly [keyof ExternalRefereeInput, string]> = [
  ["name", "Name"],
  ["email", "Email ID"],
  ["phone", "Contact Number"],
  ["state", "State"],
  ["district", "District"],
];

const CONFLICT_STATUS = 409;

export function AddExternalRefereeDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (referee: ExternalReferee) => void;
}) {
  const add = useAddExternalReferee();
  const [values, setValues] = useState<ExternalRefereeInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const close = () => {
    setValues(EMPTY);
    setErrors({});
    onOpenChange(false);
  };

  const submit = (e: React.FormEvent) => {
    // This dialog sits inside the Add Lead dialog's React tree: do not submit that.
    e.preventDefault();
    e.stopPropagation();
    const trimmed: ExternalRefereeInput = {
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      state: values.state.trim(),
      district: values.district.trim(),
    };
    const next = validateReferee(trimmed);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    add.mutate(trimmed, {
      onSuccess: (referee) => {
        toast.success("External referee added");
        onAdded?.(referee);
        close();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.status === CONFLICT_STATUS) {
          setErrors({ email: err.message });
          toast.error(err.message);
          return;
        }
        toast.error(err instanceof Error ? err.message : "Could not save referee. Please try again.");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add External Referee</DialogTitle>
          <DialogDescription>External referee contact details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map(([key, label]) => (
              <div
                key={key}
                className={`min-w-0 space-y-1.5 ${key === "name" ? "sm:col-span-2" : ""}`}
              >
                <Label htmlFor={`referee-${key}`}>
                  {label} <span className="text-accent">*</span>
                </Label>
                <Input
                  id={`referee-${key}`}
                  type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                  maxLength={key === "email" ? 255 : key === "phone" ? 30 : 100}
                  value={values[key]}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  aria-invalid={!!errors[key]}
                />
                {errors[key] && <p className="text-xs text-red-500">{errors[key]}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Save Referee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
