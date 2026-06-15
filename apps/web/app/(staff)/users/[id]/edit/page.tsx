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
import { type User } from "../../columns";

/** Turn a fetched user into the string-valued form state used by useForm. */
function userToForm(user: User): FormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    name: str(user.name),
    username: str(user.username),
    email: str(user.email),
    phone: str(user.phone),
    role_id: str(user.role_id),
    status: str(user.status),
  };
}

export default function EditUserPage({
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
      const user = await apiGet<User>(`/users/${id}`);
      setValues(userToForm(user));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load user.",
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

    // Password is intentionally omitted here — editing it lives elsewhere.
    const body = {
      name: toText(values.name),
      username: toText(values.username),
      email: toText(values.email),
      phone: toText(values.phone),
      role_id: toNumber(values.role_id),
      status: toNumber(values.status),
    };

    try {
      await apiPatch<User>(`/users/${id}`, body);
      router.push(`/users/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update the user.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit User"
        description="Update this user's details."
        actions={
          <Button variant="secondary" onClick={() => router.push(`/users/${id}`)}>
            Back to user
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
              wrapperClassName="sm:col-span-2"
            />
            <TextInput
              {...field("username")}
              label="Username"
              placeholder="Login username"
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
              {...field("role_id")}
              label="Role ID"
              type="number"
              placeholder="e.g. 1"
              hint="Numeric role reference."
            />
            <TextInput
              {...field("status")}
              label="Status"
              type="number"
              placeholder="1 = active, 0 = inactive"
              hint="1 active, 0 inactive."
            />

            <FormActions>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/users/${id}`)}
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
