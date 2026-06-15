"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, ApiError } from "@/lib/api";
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
  type FormValues,
} from "@/components/form";

/** Turn a fetched lead into the string-valued form state used by useForm. */
function leadToForm(lead: Lead): FormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    title: str(lead.title),
    phone: str(lead.phone),
    email: str(lead.email),
    country_id: str(lead.country_id),
    course_id: str(lead.course_id),
    lead_source_id: str(lead.lead_source_id),
    lead_status_id: str(lead.lead_status_id),
    remarks: str(lead.remarks),
  };
}

export default function EditLeadPage({
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
      const lead = await apiGet<Lead>(`/leads/${id}`);
      setValues(leadToForm(lead));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load lead.",
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
      phone: toText(values.phone),
      email: toText(values.email),
      country_id: toNumber(values.country_id),
      course_id: toNumber(values.course_id),
      lead_source_id: toText(values.lead_source_id),
      lead_status_id: toNumber(values.lead_status_id),
      remarks: toText(values.remarks),
    };

    try {
      await apiPatch<Lead>(`/leads/${id}`, body);
      router.push(`/leads/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update the lead.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit Lead"
        description="Update this lead's details."
        actions={
          <Button variant="secondary" onClick={() => router.push(`/leads/${id}`)}>
            Back to lead
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
              label="Name"
              placeholder="Full name"
              required
              wrapperClassName="sm:col-span-2"
            />
            <TextInput
              {...field("phone")}
              label="Phone"
              placeholder="Phone number"
            />
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
                onClick={() => router.push(`/leads/${id}`)}
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
