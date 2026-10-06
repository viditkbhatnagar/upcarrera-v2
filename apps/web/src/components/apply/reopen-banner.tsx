import { AlertCircle } from "lucide-react";

/** Shows the counsellor's reopen reason on every section after a form is reopened. */
export function ReopenBanner({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div className="min-w-0">
        <p className="text-sm font-bold">Your counsellor asked for a change</p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm">{reason}</p>
      </div>
    </div>
  );
}
