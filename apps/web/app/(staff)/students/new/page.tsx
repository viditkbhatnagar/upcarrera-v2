"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api";
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
} from "@/components/form";

/**
 * Create a new student profile. Controlled form (useForm) -> apiPost('/students')
 * -> on success navigate to the new student's detail page.
 *
 * `student_id` is the FK to an existing users.id; `address` and `consultant_id`
 * are NOT NULL columns, so they are required here (mirrors CreateStudentDto).
 * The remaining fields are optional. FK ids are free-typed numbers for now
 * (no lookup endpoints wired yet).
 */
export default function NewStudentPage() {
  const router = useRouter();
  const { field, values } = useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Build the payload: trim strings, coerce FK ids to numbers, drop blanks.
    const body = {
      student_id: toNumber(values.student_id),
      address: toText(values.address),
      consultant_id: toNumber(values.consultant_id),
      course_id: toNumber(values.course_id),
      specialisation_id: toNumber(values.specialisation_id),
      admission_status: toNumber(values.admission_status),
    };

    try {
      const created = await apiPost<Student>("/students", body);
      router.push(`/students/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create the student.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Student"
        description="Create an enrolled student record."
        actions={
          <Button variant="secondary" onClick={() => router.push("/students")}>
            Back to students
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
              onClick={() => router.push("/students")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create student"}
            </Button>
          </FormActions>
        </FormGrid>
      </Card>
    </div>
  );
}
