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
  SelectInput,
  useForm,
  toNumber,
  toText,
  type FormValues,
} from "@/components/form";
import { type Teacher } from "../../columns";

/** A teacher's account state — mirrors the `users.status` integer flag. */
const STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

/** Free-typed gender values, surfaced as a small select for consistency. */
const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

/** Turn a fetched teacher into the string-valued form state used by useForm. */
function teacherToForm(teacher: Teacher): FormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    name: str(teacher.name),
    username: str(teacher.username),
    email: str(teacher.email),
    phone: str(teacher.phone),
    code: str(teacher.code),
    gender: str(teacher.gender),
    region: str(teacher.region),
    highest_qualification: str(teacher.highest_qualification),
    languages_spoken: str(teacher.languages_spoken),
    zoom_id: str(teacher.zoom_id),
    zoom_email: str(teacher.zoom_email),
    meeting_link: str(teacher.meeting_link),
    status: str(teacher.status),
  };
}

export default function EditTeacherPage({
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
      const teacher = await apiGet<Teacher>(`/teachers/${id}`);
      setValues(teacherToForm(teacher));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load teacher.",
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

    // Password is intentionally omitted here — it is re-hashed only when set,
    // and resetting it lives elsewhere.
    const body = {
      name: toText(values.name),
      username: toText(values.username),
      email: toText(values.email),
      phone: toText(values.phone),
      code: toNumber(values.code),
      gender: toText(values.gender),
      region: toText(values.region),
      highest_qualification: toText(values.highest_qualification),
      languages_spoken: toText(values.languages_spoken),
      zoom_id: toText(values.zoom_id),
      zoom_email: toText(values.zoom_email),
      meeting_link: toText(values.meeting_link),
      status: toNumber(values.status),
    };

    try {
      await apiPatch<Teacher>(`/teachers/${id}`, body);
      router.push(`/teachers/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update the teacher.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit Teacher"
        description="Update this teacher's details."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push(`/teachers/${id}`)}
          >
            Back to teacher
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
              {...field("name")}
              label="Name"
              placeholder="Full name"
              required
              wrapperClassName="sm:col-span-2"
            />
            <TextInput
              {...field("username")}
              label="Username"
              placeholder="Login username"
              required
            />
            <TextInput
              {...field("email")}
              label="Email"
              type="email"
              placeholder="name@example.com"
            />
            <TextInput
              {...field("phone")}
              label="Phone"
              placeholder="Phone number"
            />
            <TextInput
              {...field("code")}
              label="Code"
              type="number"
              placeholder="e.g. 1001"
              hint="Optional teacher code."
            />
            <SelectInput
              {...field("gender")}
              label="Gender"
              options={GENDER_OPTIONS}
              placeholder="Select gender…"
            />
            <TextInput
              {...field("region")}
              label="Region"
              placeholder="e.g. Europe"
            />
            <TextInput
              {...field("highest_qualification")}
              label="Highest qualification"
              placeholder="e.g. MSc"
            />
            <TextInput
              {...field("languages_spoken")}
              label="Languages spoken"
              placeholder="e.g. English, Spanish"
            />
            <TextInput
              {...field("zoom_id")}
              label="Zoom ID"
              placeholder="Zoom user ID"
            />
            <TextInput
              {...field("zoom_email")}
              label="Zoom email"
              type="email"
              placeholder="zoom@example.com"
            />
            <TextInput
              {...field("meeting_link")}
              label="Meeting link"
              placeholder="https://…"
              wrapperClassName="sm:col-span-2"
            />
            <SelectInput
              {...field("status")}
              label="Status"
              options={STATUS_OPTIONS}
              placeholder="Select status…"
            />

            <FormActions>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/teachers/${id}`)}
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
