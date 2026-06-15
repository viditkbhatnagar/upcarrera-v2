"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
import type { Student } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import {
  FormGrid,
  FormActions,
  TextInput,
  TextareaInput,
  useForm,
  toNumber,
  toText,
  type FormValues,
} from "@/components/form";

/** Turn a fetched student into the string-valued form state used by useForm. */
function studentToForm(student: Student): FormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    student_id: str(student.student_id),
    consultant_id: str(student.consultant_id),
    course_id: str(student.course_id),
    specialisation_id: str(student.specialisation_id),
    admission_status: str(student.admission_status),
    address: str(student.address),
  };
}

export default function EditStudentPage({
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
      const student = await apiGet<Student>(`/students/${id}`);
      setValues(studentToForm(student));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load student.",
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
      student_id: toNumber(values.student_id),
      address: toText(values.address),
      consultant_id: toNumber(values.consultant_id),
      course_id: toNumber(values.course_id),
      specialisation_id: toNumber(values.specialisation_id),
      admission_status: toNumber(values.admission_status),
    };

    try {
      await apiPatch<Student>(`/students/${id}`, body);
      router.push(`/students/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update the student.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit Student"
        description="Update this student's details."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push(`/students/${id}`)}
          >
            Back to student
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
              {...field("student_id")}
              label="Student (user) ID"
              type="number"
              placeholder="e.g. 1024"
              required
              hint="Numeric reference to the linked user account."
            />
            <TextInput
              {...field("consultant_id")}
              label="Consultant ID"
              type="number"
              placeholder="e.g. 7"
              required
              hint="Numeric consultant reference."
            />
            <TextInput
              {...field("course_id")}
              label="Course ID"
              type="number"
              placeholder="e.g. 12"
              hint="Numeric course reference."
            />
            <TextInput
              {...field("specialisation_id")}
              label="Specialisation ID"
              type="number"
              placeholder="e.g. 3"
              hint="Numeric specialisation reference."
            />
            <TextInput
              {...field("admission_status")}
              label="Admission status"
              type="number"
              placeholder="e.g. 2"
              hint="Numeric admission status code."
            />
            <TextareaInput
              {...field("address")}
              label="Address"
              placeholder="Postal address…"
              required
              wrapperClassName="sm:col-span-2"
            />

            <FormActions>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/students/${id}`)}
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
