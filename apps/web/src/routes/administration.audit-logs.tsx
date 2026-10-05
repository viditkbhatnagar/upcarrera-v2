import { createFileRoute } from "@tanstack/react-router";
import {
  ScrollText,
  ShieldCheck,
  GitBranch,
  Pencil,
  Wallet,
  UserCheck,
  Clock,
  Database,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/administration/audit-logs")({
  head: () => ({ meta: [{ title: "Audit Logs — upCarrera" }] }),
  component: AuditLogsPage,
});

interface CapturedItem {
  icon: typeof GitBranch;
  title: string;
  detail: string;
}

// What the committed Phase 1 backend records today (audit.service.ts +
// application_stage_log). No rows are shown here because the read-model/viewer is
// a Phase 2 deliverable — this page states that honestly rather than inventing data.
const CAPTURED: CapturedItem[] = [
  {
    icon: GitBranch,
    title: "Stage transitions",
    detail: "Every move through the admission pipeline, with the from/to stage, actor and reason.",
  },
  {
    icon: Pencil,
    title: "Field corrections",
    detail: "Old → new value for each corrected applicant field, with a password/OTP denylist.",
  },
  {
    icon: Wallet,
    title: "Registration-fee events",
    detail: "Fee entries, verifications and mismatches, linked to the application and actor.",
  },
  {
    icon: UserCheck,
    title: "Document & SA reviews",
    detail: "Per-document verdicts and the Student Affairs decision on each application.",
  },
];

function AuditLogsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Administration
        </div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <ScrollText className="h-6 w-6 text-primary" /> Audit Logs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A tamper-evident record of who changed what, and when.
        </p>
      </div>

      {/* Status banner */}
      <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-surface shadow-card dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-surface">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <h2 className="text-base font-semibold text-foreground">Logging is active</h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              The Phase 1 workflow writes a complete, append-only audit trail on the server for
              every stage change, correction, payment and review. The searchable viewer below
              arrives in Phase 2.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30 sm:self-center">
            <Clock className="h-3.5 w-3.5" /> Viewer in Phase 2
          </span>
        </div>
      </div>

      {/* What's captured */}
      <section className="rounded-2xl border border-border bg-surface shadow-card">
        <header className="border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold text-foreground">What is being captured</h3>
        </header>
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
          {CAPTURED.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-3 bg-surface p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-foreground">{item.title}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Where it lives */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">Where the trail lives</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Entries are stored in the <code className="rounded bg-muted px-1 py-0.5 font-mono">audit_log</code>{" "}
              and <code className="rounded bg-muted px-1 py-0.5 font-mono">application_stage_log</code> tables.
              Each application's own history is already visible on its Timeline tab today.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Phase 2 adds the cross-application viewer here: filtering by actor, module, date range
            and action, with export. No sample or placeholder rows are shown until it is backed by a
            real read endpoint.
          </span>
        </div>
      </section>
    </div>
  );
}
