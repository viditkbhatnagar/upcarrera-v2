import { Loader2, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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

export const errMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

export function ListState({
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        {errMessage(error, "Could not load the list.")}
      </div>
    );
  if (empty) return <div className="px-6 py-14 text-center text-sm text-muted-foreground">{emptyText}</div>;
  return <>{children}</>;
}

export function RowActions({
  active,
  busy,
  label,
  onToggle,
  onEdit,
  onDelete,
}: {
  active: boolean;
  busy: boolean;
  label: string;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Switch
        checked={active}
        disabled={busy}
        onCheckedChange={onToggle}
        aria-label={`${active ? "Deactivate" : "Activate"} ${label}`}
      />
      <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Edit ${label}`}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${label}`}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export function ConfirmDelete({
  title,
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string | null;
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It disappears from the counsellor portal immediately. To hide it temporarily, deactivate
            it instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={onConfirm}>
            {busy ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
