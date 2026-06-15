"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import {
  FormGrid,
  FormActions,
  TextInput,
  useForm,
  toText,
  type FormValues,
} from "@/components/form";

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

/** Turn a fetched session into the string-valued form state used by useForm. */
function sessionToForm(session: Session): FormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    session_title: str(session.session_title),
  };
}

export default function EditSessionPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;
  const { field, values, setValues } = useForm();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const session = await apiGet<Session>(`/sessions/${id}`);
      setValues(sessionToForm(session));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load session.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, setValues]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const body = {
      session_title: toText(values.session_title),
    };

    try {
      await apiPatch<Session>(`/sessions/${id}`, body);
      router.push(`/sessions/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update the session.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit Session"
        description="Update this session's details."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push(`/sessions/${id}`)}
          >
            Back to session
          </Button>
        }
      />

      {(error || loadError) && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {error ?? loadError}
        </div>
      )}

      <Card className="max-w-3xl p-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-10 w-full animate-pulse rounded-lg bg-ink/10"
              />
            ))}
          </div>
        ) : (
          <FormGrid onSubmit={handleSubmit} noValidate>
            <TextInput
              {...field("session_title")}
              label="Title"
              placeholder="e.g. Algebra — Week 3"
              required
              wrapperClassName="sm:col-span-2"
              hint="A short, descriptive name for this live class session."
            />

            <FormActions>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/sessions/${id}`)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </FormActions>
          </FormGrid>
        )}
      </Card>
    </div>
  );
}
