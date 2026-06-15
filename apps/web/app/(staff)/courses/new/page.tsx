"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import {
  FormGrid,
  FormActions,
  TextInput,
  useForm,
  toNumber,
  toText,
} from "@/components/form";

/** A created course (subset of fields the UI uses). Mirrors the `course` Prisma model. */
interface Course {
  id: number;
  [key: string]: unknown;
}

/**
 * Create a new course. Controlled form (useForm) -> apiPost('/courses') ->
 * on success navigate to the new course's detail page. The API treats every
 * field as optional (see CreateCourseDto), so this is a light form; the
 * university FK is a free-typed number for now (no lookup endpoint wired yet).
 */
export default function NewCoursePage() {
  const router = useRouter();
  const { field, values } = useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Build the payload: trim strings, coerce the FK id to a number, drop blanks.
    const body = {
      title: toText(values.title),
      short_name: toText(values.short_name),
      stream: toText(values.stream),
      level: toText(values.level),
      duration: toText(values.duration),
      total_duration: toText(values.total_duration),
      university_id: toNumber(values.university_id),
    };

    try {
      const created = await apiPost<Course>("/courses", body);
      router.push(`/courses/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create the course.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Course"
        description="Add a programme to the catalogue."
        actions={
          <Button variant="secondary" onClick={() => router.push("/courses")}>
            Back to courses
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
            {...field("title")}
            label="Title"
            placeholder="Course title"
            required
            wrapperClassName="sm:col-span-2"
          />
          <TextInput
            {...field("short_name")}
            label="Short Name"
            placeholder="e.g. MBA"
          />
          <TextInput
            {...field("stream")}
            label="Stream"
            placeholder="e.g. Management"
          />
          <TextInput
            {...field("level")}
            label="Level"
            placeholder="e.g. Postgraduate"
          />
          <TextInput
            {...field("duration")}
            label="Duration"
            placeholder="e.g. 2 years"
          />
          <TextInput
            {...field("total_duration")}
            label="Total Duration"
            placeholder="e.g. 24 months"
          />
          <TextInput
            {...field("university_id")}
            label="University ID"
            type="number"
            placeholder="e.g. 1"
            hint="Numeric university reference."
          />

          <FormActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/courses")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create course"}
            </Button>
          </FormActions>
        </FormGrid>
      </Card>
    </div>
  );
}
