import { useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { apiPost, ApiError } from "@/lib/api";
import { getToken } from "@/lib/session";
import { toast } from "sonner";

/** Shared call-UI primitives used by the student panel, the student list, and
 *  the Call History screen — so the recording proxy + start-call logic live in
 *  one place. */

export const CALLS_API_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? "/api"
).replace(/\/+$/, "");

export interface CallLogRow {
  uuid: string;
  direction: string | null;
  phoneNumber: string | null;
  virtualNumber: string | null;
  status: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  cost: number | null;
}
export interface CallLogResponse {
  data: CallLogRow[];
  totalRows: number | null;
  pageNumber: number;
  perPage: number;
}
export interface CallHealth {
  configured: boolean;
  virtualNumber: string | null;
}

export function fmtDuration(s: number | null): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
export function fmtWhen(iso: string | null): string {
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
export function statusTone(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("answer") || s.includes("complete"))
    return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20";
  if (s.includes("miss") || s.includes("fail") || s.includes("no"))
    return "bg-rose-500/10 text-rose-700 ring-rose-500/20";
  return "bg-slate-500/10 text-slate-700 ring-slate-500/20";
}

/** Fetches the proxied recording (Bearer auth) on demand and plays it inline. */
export function RecordingPlayer({ recordingUrl }: { recordingUrl: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (src || loading) return;
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${CALLS_API_BASE}/admin/calls/recording?path=${encodeURIComponent(recordingUrl)}`,
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

/** Click-to-call action: rings the agent's phone, then connects the contact. */
export function useStartCall() {
  const [callingPhone, setCallingPhone] = useState<string | null>(null);
  const start = async (phone: string | null, onStarted?: () => void) => {
    if (!phone) {
      toast.error("No phone number on file for this contact.");
      return;
    }
    setCallingPhone(phone);
    try {
      await apiPost("/admin/calls/create", { studentPhone: phone });
      toast.success("Call started — your phone will ring shortly.");
      onStarted?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start the call.");
    } finally {
      setCallingPhone(null);
    }
  };
  return { callingPhone, start };
}
