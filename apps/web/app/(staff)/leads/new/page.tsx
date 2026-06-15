"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api";
import type { Lead } from "@/lib/types";
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
 * Create a new CRM lead. Controlled form (useForm) -> apiPost('/leads') ->
 * on success navigate back to the list. The API treats almost every field as
 * optional (see CreateLeadDto), so this is a light form; FK ids are free-typed
 * numbers for now (no lookup endpoints wired yet).
 */
export default function NewLeadPage() {
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
      title: toText(values.title),
      phone: toText(values.phone),
      email: toText(values.email),
      country_id: toNumber(values.country_id),
      course_id: toNumber(values.course_id),
      lead_source_id: toText(values.lead_source_id), // legacy VARCHAR, not an FK int
      lead_status_id: toNumber(values.lead_status_id),
      remarks: toText(values.remarks),
    };

    try {
      const created = await apiPost<Lead>("/leads", body);
      router.push(`/leads/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create the lead.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Lead"
        description="Add a prospect to the CRM funnel."
        actions={
          <Button variant="secondary" onClick={() => router.push("/leads")}>
            Back to leads
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
            label="Name"
            placeholder="Full name"
            required
            wrapperClassName="sm:col-span-2"
          />
          <TextInput {...field("phone")} label="Phone" placeholder="Phone number" />
          <TextInput
            {...field("email")}
            label="Email"
            type="email"
            placeholder="name@example.com"
          />
          <TextInput
            {...field("country_id")}
            label="Country ID"
            type="number"
            placeholder="e.g. 1"
            hint="Numeric country reference."
          />
          <TextInput
            {...field("course_id")}
            label="Course ID"
            type="number"
            placeholder="e.g. 12"
            hint="Numeric course reference."
          />
          <TextInput
            {...field("lead_source_id")}
            label="Lead source"
            placeholder="e.g. Website"
          />
          <TextInput
            {...field("lead_status_id")}
            label="Lead status ID"
            type="number"
            placeholder="e.g. 1"
          />
          <TextareaInput
            {...field("remarks")}
            label="Remarks"
            placeholder="Notes about this prospect…"
            wrapperClassName="sm:col-span-2"
          />

          <FormActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/leads")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create lead"}
            </Button>
          </FormActions>
        </FormGrid>
      </Card>
    </div>
  );
}
