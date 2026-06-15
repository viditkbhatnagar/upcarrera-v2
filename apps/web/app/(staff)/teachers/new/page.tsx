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
  SelectInput,
  useForm,
  toNumber,
  toText,
} from "@/components/form";
import { type Teacher } from "../columns";

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

/**
 * Create a new teacher (a `users` row with role_id=3). Controlled form (useForm)
 * -> apiPost('/teachers') -> on success navigate to the detail page. The API
 * requires name/username/password (see CreateTeacherDto) and hashes the password
 * with bcrypt server-side; everything else is optional. FK ids are free-typed
 * numbers for now (no lookup endpoints wired yet).
 */
export default function NewTeacherPage() {
  const router = useRouter();
  const { field, values } = useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Build the payload: trim strings, coerce numeric fields, drop blanks.
    const body = {
      name: toText(values.name),
      username: toText(values.username),
      password: toText(values.password),
      email: toText(values.email),
      phone: toText(values.phone),
      code: toNumber(values.code),
      gender: toText(values.gender),
      region: toText(values.region),
      highest_qualification: toText(values.highest_qualification),
      languages_spoken: toText(values.languages_spoken),
      zoom_id: toText(values.zoom_id),
      zoom_email: toText(values.zoom_email),
      zoom_password: toText(values.zoom_password),
      meeting_link: toText(values.meeting_link),
      status: toNumber(values.status),
    };

    try {
      const created = await apiPost<Teacher>("/teachers", body);
      router.push(`/teachers/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create the teacher.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Teacher"
        description="Register an instructor on the platform."
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

      <Card className="max-w-3xl p-6">
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
            {...field("password")}
            label="Password"
            type="password"
            placeholder="Set an initial password"
            required
            hint="Hashed with bcrypt on the server."
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
            {...field("zoom_password")}
            label="Zoom password"
            type="password"
            placeholder="Zoom account password"
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
            hint="Defaults to active when unset."
          />

          <FormActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/teachers")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create teacher"}
            </Button>
          </FormActions>
        </FormGrid>
      </Card>
    </div>
  );
}
