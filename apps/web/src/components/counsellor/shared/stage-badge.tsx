import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STAGE_META, type Stage } from "@/components/applications/stage-model";

// Naji's soft stage pills, mapped onto the real workflow stages.
const STAGE_STYLES: Record<Stage, string> = {
  lead_added: "bg-info-soft text-info border-transparent",
  form_pending: "bg-[oklch(0.95_0.05_310)] text-[oklch(0.45_0.2_310)] border-transparent",
  counsellor_review: "bg-[oklch(0.96_0.06_85)] text-[oklch(0.4_0.12_75)] border-transparent",
  fee_pending: "bg-warning-soft text-warning-foreground border-transparent",
  fee_verification: "bg-info-soft text-info border-transparent",
  sa_verification: "bg-[oklch(0.96_0.06_85)] text-[oklch(0.4_0.12_75)] border-transparent",
  converted: "bg-success-soft text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-transparent",
};

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium gap-1.5 py-0.5", STAGE_STYLES[stage], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {STAGE_META[stage]?.label ?? stage}
    </Badge>
  );
}
