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
import { type User } from "../columns";

/**
 * Create a new platform user (staff/student identity). Controlled form (useForm)
 * -> apiPost('/users') -> on success navigate to the detail page. The API treats
 * almost every field as optional (see CreateUserDto), but `password` is required
 * and hashed with bcrypt server-side. FK ids are free-typed numbers for now (no
 * lookup endpoints wired yet).
 */
export default function NewUserPage() {
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
      name: toText(values.name),
      username: toText(values.username),
      email: toText(values.email),
      phone: toText(values.phone),
      role_id: toNumber(values.role_id),
      password: toText(values.password),
      status: toNumber(values.status),
    };

    try {
      const created = await apiPost<User>("/users", body);
      router.push(`/users/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create the user.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New User"
        description="Register a staff or student identity on the platform."
        actions={
          <Button variant="secondary" onClick={() => router.push("/users")}>
            Back to users
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
            {...field("password")}
            label="Password"
            type="password"
            placeholder="Set an initial password"
            required
            hint="Hashed with bcrypt on the server."
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
              onClick={() => router.push("/users")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create user"}
            </Button>
          </FormActions>
        </FormGrid>
      </Card>
    </div>
  );
}
