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
  toNumber,
  toText,
  type FormValues,
} from "@/components/form";

/** A course (subset of fields the UI uses). Mirrors the `course` Prisma model. */
interface Course {
  id: number;
  title: string | null;
  short_name: string | null;
  stream: string | null;
  level: string | null;
  duration: string | null;
  total_duration: string | null;
  university_id: number | null;
  [key: string]: unknown;
}

/** Turn a fetched course into the string-valued form state used by useForm. */
function courseToForm(course: Course): FormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    title: str(course.title),
    short_name: str(course.short_name),
    stream: str(course.stream),
    level: str(course.level),
    duration: str(course.duration),
    total_duration: str(course.total_duration),
    university_id: str(course.university_id),
  };
}

export default function EditCoursePage({
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
      const course = await apiGet<Course>(`/courses/${id}`);
      setValues(courseToForm(course));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load course.",
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
      title: toText(values.title),
      short_name: toText(values.short_name),
      stream: toText(values.stream),
      level: toText(values.level),
      duration: toText(values.duration),
      total_duration: toText(values.total_duration),
      university_id: toNumber(values.university_id),
    };

    try {
      await apiPatch<Course>(`/courses/${id}`, body);
      router.push(`/courses/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update the course.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit Course"
        description="Update this course's details."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push(`/courses/${id}`)}
          >
            Back to course
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
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-10 w-full animate-pulse rounded-lg bg-ink/10"
              />
            ))}
          </div>
        ) : (
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
                onClick={() => router.push(`/courses/${id}`)}
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
