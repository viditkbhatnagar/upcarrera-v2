import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  PhoneCall,
  Play,
  Loader2,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import { toast } from "sonner";

interface CallLogRow {
  uuid: string;
  direction: string | null;
  phoneNumber: string | null;
  status: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  cost: number | null;
}
interface CallLogResponse {
  data: CallLogRow[];
  totalRows: number | null;
  pageNumber: number;
  perPage: number;
}
interface CallHealth {
  configured: boolean;
  virtualNumber: string | null;
}

const API_BASE =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? "/api").replace(/\/+$/, "");

function fmtDuration(s: number | null): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function statusTone(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("answer") || s.includes("complete")) return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
  if (s.includes("miss") || s.includes("fail") || s.includes("no")) return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  return "bg-slate-500/10 text-slate-700 ring-slate-500/20";
}

/** Fetches the proxied recording (Bearer auth) on demand and plays it inline. */
function RecordingPlayer({ recordingUrl }: { recordingUrl: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (src || loading) return;
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_BASE}/admin/calls/recording?path=${encodeURIComponent(recordingUrl)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("recording");
      const blob = await res.blob();
      setSrc(URL.createObjectURL(blob));
    } catch {
      toast.error("Could not load the recording.");
    } finally {
      setLoading(false);
    }
  };

  if (src) return <audio controls src={src} className="h-8 w-56" />;
  return (
    <button
      onClick={load}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      Play
    </button>
  );
}

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

  const [calling, setCalling] = useState(false);
  const onCall = async () => {
    if (!phone) {
      toast.error("No phone number on file for this student.");
      return;
    }
    setCalling(true);
    try {
      await apiPost("/admin/calls/create", { studentPhone: phone });
      toast.success("Call started — your phone will ring shortly.");
      setTimeout(() => logQuery.refetch(), 4000);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start the call.");
    } finally {
      setCalling(false);
    }
  };

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
          onClick={onCall}
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
