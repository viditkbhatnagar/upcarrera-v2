import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COLLECTION_MODEL_LABEL,
  STATUS_LABEL,
  type FeeCollectionModel,
  type FeeStatus,
  type IntakeStatus,
} from "@/lib/api/fee-structures";

const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1";

const STATUS_STYLE: Record<FeeStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  expired: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function StatusChip({ status, className }: { status: FeeStatus; className?: string }) {
  return <span className={cn(PILL, STATUS_STYLE[status], className)}>{STATUS_LABEL[status]}</span>;
}

const INTAKE_STYLE: Record<IntakeStatus, string> = {
  Upcoming: "bg-sky-50 text-sky-700 ring-sky-200",
  Open: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Closed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  Unknown: "bg-zinc-50 text-zinc-500 ring-zinc-200",
};

export function IntakeStatusBadge({ status }: { status: IntakeStatus }) {
  return <span className={cn(PILL, INTAKE_STYLE[status])}>{status}</span>;
}

const MODEL_STYLE: Record<FeeCollectionModel, string> = {
  upcarrera_collects: "bg-primary/10 text-primary ring-primary/20",
  university_collects: "bg-violet-50 text-violet-700 ring-violet-200",
};

/**
 * The university's collection model, or an amber "Model not set" pill that links
 * to the university so an Admin can fix it (activation is blocked until it is set).
 */
export function CollectionModelBadge({
  model,
  universityId,
}: {
  model: FeeCollectionModel | null;
  universityId: number;
}) {
  if (!model) {
    return (
      <Link
        to="/universities/universities/$code"
        params={{ code: String(universityId) }}
        className={cn(
          PILL,
          "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100 transition-colors",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <AlertTriangle className="h-3 w-3" />
        Model not set
      </Link>
    );
  }
  return <span className={cn(PILL, MODEL_STYLE[model])}>{COLLECTION_MODEL_LABEL[model]}</span>;
}
