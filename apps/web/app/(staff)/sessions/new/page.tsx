"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { FormGrid, FormActions, TextInput, useForm, toText } from "@/components/form";

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

/**
 * Create a new live-class session. Controlled form (useForm) ->
 * apiPost('/sessions') -> on success navigate to the detail page. The API
 * accepts a single optional field (session_title); see CreateSessionDto.
 */
export default function NewSessionPage() {
  const router = useRouter();
  const { field, values } = useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Build the payload: trim the title, drop it if blank.
    const body = {
      session_title: toText(values.session_title),
    };

    try {
      const created = await apiPost<Session>("/sessions", body);
      router.push(`/sessions/${created.session_id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create the session.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Session"
        description="Schedule a live class session."
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

      <Card className="max-w-3xl p-6">
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
              onClick={() => router.push("/sessions")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create session"}
            </Button>
          </FormActions>
        </FormGrid>
      </Card>
    </div>
  );
}
