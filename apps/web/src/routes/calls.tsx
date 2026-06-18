import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, Search, Loader2, AlertCircle, Info } from "lucide-react";
import { apiGet } from "@/lib/api";
import {
  RecordingPlayer,
  fmtDuration,
  fmtWhen,
  statusTone,
  type CallLogResponse,
  type CallHealth,
} from "@/components/calls/calls-ui";

export const Route = createFileRoute("/calls")({
  head: () => ({ meta: [{ title: "Call History — upCarrera" }] }),
  component: CallHistoryPage,
});

function CallHistoryPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(""); // submitted phone number

  const { data: health } = useQuery({
    queryKey: ["calls", "health"],
    queryFn: () => apiGet<CallHealth>("/calls/health"),
    staleTime: 5 * 60 * 1000,
  });
  const configured = health?.configured ?? false;

  const logQuery = useQuery({
    queryKey: ["calls", "history", query],
    queryFn: () =>
      apiGet<CallLogResponse>("/admin/calls/log", {
        phoneNumber: query || undefined,
        perPage: 50,
      }),
    enabled: configured && query.length > 0,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(input.trim());
  };

  const rows = logQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Telephony
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Call History
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Look up call activity and recordings for a phone number.
        </p>
      </div>

      {!configured ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center shadow-card">
          <AlertCircle className="mx-auto h-9 w-9 text-amber-500/70" />
          <div className="mt-2 text-sm font-semibold text-foreground">Calling isn’t activated yet</div>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            The Ainvox calling integration is deployed but awaiting credentials.
          </p>
        </div>
      ) : (
        <>
          {/* Shared-number caveat */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              Calls run on the shared number{" "}
              <span className="font-semibold">{health?.virtualNumber ?? "—"}</span>. Search a
              specific phone number to view its activity — results are scoped to that number.
            </div>
          </div>

          {/* Search */}
          <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Phone number, e.g. +91XXXXXXXXXX or 10-digit"
                className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim()}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary-hover disabled:opacity-60"
            >
              <Search className="h-4 w-4" /> Search
            </button>
          </form>

          {/* Results */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {query === "" ? (
              <div className="flex flex-col items-center gap-1 py-16 text-center">
                <Phone className="h-9 w-9 text-muted-foreground/40" />
                <div className="text-sm font-semibold text-foreground">Search a number to begin</div>
                <div className="text-xs text-muted-foreground">
                  Enter a phone number above to see its calls and recordings.
                </div>
              </div>
            ) : logQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading calls…
              </div>
            ) : logQuery.isError ? (
              <div className="flex flex-col items-center gap-1 py-16 text-center">
                <AlertCircle className="h-8 w-8 text-rose-500/60" />
                <div className="text-sm font-semibold text-foreground">Couldn’t load calls</div>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-16 text-center">
                <Phone className="h-8 w-8 text-muted-foreground/50" />
                <div className="text-sm font-semibold text-foreground">No calls for {query}</div>
              </div>
            ) : (
              <>
                <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                  {logQuery.data?.totalRows ?? rows.length} call(s) for {query}
                </div>
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full min-w-[760px] border-collapse text-sm">
                    <thead className="bg-muted/60">
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5 font-semibold">When</th>
                        <th className="px-4 py-2.5 font-semibold">Number</th>
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
                          <td className="px-4 py-3 font-mono text-xs text-foreground">{c.phoneNumber ?? "—"}</td>
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
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
