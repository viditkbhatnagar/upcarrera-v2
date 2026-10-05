// The stage action bar. Buttons are rendered ONLY from the server's
// `allowed_actions` — never hard-coded per stage/role. `correct` is excluded here
// because it is surfaced as inline editing in the Application Form tab. The page
// owns the dialogs and receives the chosen action through onAction.
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACTION_META, type WorkflowAction } from "./stage-model";

interface StageActionBarProps {
  actions: WorkflowAction[];
  onAction: (action: WorkflowAction) => void;
  disabled?: boolean;
  /** Actions to render but keep disabled (e.g. verify/mismatch before the payment loads). */
  disabledActions?: readonly WorkflowAction[];
}

const BAR_ORDER: WorkflowAction[] = [
  "send_form",
  "mark_form_received",
  "accept",
  "record_payment",
  "verify",
  "approve",
  "resume",
  "reopen",
  "mismatch",
  "hold",
  "convert",
];

export function StageActionBar({
  actions,
  onAction,
  disabled,
  disabledActions,
}: StageActionBarProps) {
  const visible = BAR_ORDER.filter((a) => actions.includes(a) && ACTION_META[a]);

  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" />
        No actions are available to you at this stage.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Actions
      </span>
      {visible.map((action) => {
        const meta = ACTION_META[action]!;
        const Icon = meta.icon;
        const variant =
          meta.tone === "primary" ? "default" : meta.tone === "destructive" ? "destructive" : "outline";
        return (
          <Button
            key={action}
            variant={variant}
            size="sm"
            disabled={disabled || disabledActions?.includes(action)}
            onClick={() => onAction(action)}
          >
            <Icon className="h-4 w-4" />
            {meta.label}
          </Button>
        );
      })}
    </div>
  );
}
