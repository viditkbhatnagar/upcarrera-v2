import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneCall, Loader2, AlertCircle, RefreshCcw } from "lucide-react";
import { apiGet } from "@/lib/api";
import {
  RecordingPlayer,
  useStartCall,
  fmtDuration,
  fmtWhen,
  statusTone,
  type CallLogResponse,
  type CallHealth,
} from "./calls-ui";

export function StudentCallPanel({
  phone,
  name,
}: {
  phone: string | null;
  name: string | null;
}) {
  const { data: health } = useQuery({
    queryKey: ["calls", "health"],
    queryFn: () => apiGet<CallHealth>("/calls/health"),
    staleTime: 5 * 60 * 1000,
  });
  const configured = health?.configured ?? false;

  const logQuery = useQuery({
    queryKey: ["calls", "log", phone],
    queryFn: () =>
      apiGet<CallLogResponse>("/admin/calls/log", {
        phoneNumber: phone ?? undefined,
        perPage: 20,
      }),
    enabled: configured && !!phone,
  });

  const { callingPhone, start } = useStartCall();
  const calling = callingPhone === phone && callingPhone !== null;

  // Dark state — integration deployed but credentials not yet provided.
  if (!configured) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center shadow-card">
        <AlertCircle className="mx-auto h-8 w-8 text-amber-500/70" />
        <div className="mt-2 text-sm font-semibold text-foreground">
          Calling isn’t activated yet
        </div>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          The Ainvox calling integration is deployed but awaiting credentials. Once the
          keys are added on the server, the call button and history appear here.
        </p>
      </div>
    );
  }

  const rows = logQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">Voice call</div>
          <div className="truncate text-xs text-muted-foreground">
            Rings your phone, then connects {name ?? "the student"}
            {health?.virtualNumber ? ` from ${health.virtualNumber}` : ""}.
          </div>
        </div>
        <button
          onClick={() => start(phone, () => setTimeout(() => logQuery.refetch(), 4000))}
          disabled={calling || !phone}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover disabled:opacity-60"
        >
          {calling ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
          {phone ? `Call ${phone}` : "No phone on file"}
        </button>
      </div>

      {/* History */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">
            Call history{logQuery.data?.totalRows != null ? ` · ${logQuery.data.totalRows}` : ""}
          </div>
          <button
            onClick={() => logQuery.refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${logQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          {logQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading calls…
            </div>
          ) : logQuery.isError ? (
            <div className="flex flex-col items-center gap-1 py-12 text-center">
              <AlertCircle className="h-7 w-7 text-rose-500/60" />
              <div className="text-sm font-semibold text-foreground">Couldn’t load call history</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-12 text-center">
              <Phone className="h-7 w-7 text-muted-foreground/50" />
              <div className="text-sm font-semibold text-foreground">No calls yet</div>
              <div className="text-xs text-muted-foreground">Calls with this student will appear here.</div>
            </div>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="bg-muted/60">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">When</th>
                  <th className="px-4 py-2.5 font-semibold">Direction</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Duration</th>
                  <th className="px-4 py-2.5 font-semibold">Recording</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.uuid} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 text-sm text-foreground">{fmtWhen(c.startedAt)}</td>
                    <td className="px-4 py-3 text-sm capitalize text-foreground">{c.direction ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${statusTone(c.status)}`}>
                        {c.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-foreground">{fmtDuration(c.durationSeconds)}</td>
                    <td className="px-4 py-3">
                      {c.recordingUrl ? <RecordingPlayer recordingUrl={c.recordingUrl} /> : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
