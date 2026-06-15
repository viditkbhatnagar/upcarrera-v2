"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete, ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { type Teacher, STATUS_ACTIVE } from "../columns";

/** Fields surfaced on the detail page, in display order. */
const DETAIL_FIELDS: { key: keyof Teacher; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "username", label: "Username" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "code", label: "Code" },
  { key: "gender", label: "Gender" },
  { key: "region", label: "Region" },
  { key: "highest_qualification", label: "Highest qualification" },
  { key: "languages_spoken", label: "Languages spoken" },
  { key: "zoom_id", label: "Zoom ID" },
  { key: "zoom_email", label: "Zoom email" },
  { key: "meeting_link", label: "Meeting link" },
  { key: "status", label: "Status" },
];

function displayValue(key: keyof Teacher, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "status") return value === STATUS_ACTIVE ? "Active" : "Inactive";
  return String(value);
}

export default function TeacherDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state, separate from the page-load error.
  const [busy, setBusy] = useState<"delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Teacher>(`/teachers/${id}`);
      setTeacher(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load teacher.",
      );
      setTeacher(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!window.confirm("Delete this teacher? This cannot be undone.")) return;
    setBusy("delete");
    setActionError(null);
    try {
      await apiDelete(`/teachers/${id}`);
      router.push("/teachers");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to delete teacher.",
      );
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={loading ? "Teacher" : teacher?.name || `Teacher #${id}`}
        description="Instructor detail."
        actions={
          <Button variant="secondary" onClick={() => router.push("/teachers")}>
            Back to teachers
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
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-5 w-full max-w-sm animate-pulse rounded bg-ink/10"
              />
            ))}
          </div>
        ) : teacher ? (
          <>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {DETAIL_FIELDS.map(({ key, label }) => (
                <div
                  key={String(key)}
                  className={key === "meeting_link" ? "sm:col-span-2" : undefined}
                >
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-400">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm text-ink">
                    {displayValue(key, teacher[key])}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/[0.07] pt-5">
              <Link href={`/teachers/${id}/edit`}>
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
          <p className="text-sm text-ink-400">Teacher not found.</p>
        )}
      </Card>
    </div>
  );
}
