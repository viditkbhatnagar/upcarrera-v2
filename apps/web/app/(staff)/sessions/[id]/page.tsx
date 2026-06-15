"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete, ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";

/**
 * A live-class session as returned by the API. Backed by the thin `sessions`
 * table: its PK is `session_id` (NOT `id`) and the only business column is
 * `session_title`. teacher_id / student_id / course_id / scheduled_date live on
 * `demo_sessions`, so they are NOT accepted or returned here.
 */
interface Session {
  session_id: number;
  session_title: string | null;
  created_at: string | null;
  updated_at: string | null;
  [key: string]: unknown;
}

/** Fields surfaced on the detail page, in display order. */
const DETAIL_FIELDS: { key: keyof Session; label: string }[] = [
  { key: "session_id", label: "Session ID" },
  { key: "session_title", label: "Title" },
  { key: "created_at", label: "Created" },
  { key: "updated_at", label: "Updated" },
];

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function SessionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state, separate from the page-load error.
  const [busy, setBusy] = useState<"delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Session>(`/sessions/${id}`);
      setSession(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load session.",
      );
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    setBusy("delete");
    setActionError(null);
    try {
      await apiDelete(`/sessions/${id}`);
      router.push("/sessions");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to delete session.",
      );
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={loading ? "Session" : session?.session_title || `Session #${id}`}
        description="Live class session detail."
        actions={
          <Button variant="secondary" onClick={() => router.push("/sessions")}>
            Back to sessions
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {error}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {actionError}
        </div>
      )}

      <Card className="max-w-3xl p-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-5 w-full max-w-sm animate-pulse rounded bg-ink/10"
              />
            ))}
          </div>
        ) : session ? (
          <>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {DETAIL_FIELDS.map(({ key, label }) => (
                <div key={String(key)}>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-400">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm text-ink">
                    {displayValue(session[key])}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/[0.07] pt-5">
              <Link href={`/sessions/${id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={busy !== null}
                className="text-accent-600 hover:bg-accent-50"
              >
                {busy === "delete" ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-400">Session not found.</p>
        )}
      </Card>
    </div>
  );
}
