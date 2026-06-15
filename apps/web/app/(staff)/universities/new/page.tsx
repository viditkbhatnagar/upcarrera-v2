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
  TextareaInput,
  useForm,
  toNumber,
  toText,
} from "@/components/form";

/** A university catalog row returned by the API (subset used here). */
interface University {
  id: number;
  [key: string]: unknown;
}

/** Legacy `status` is a 1-char flag: "1" = active, "0" = inactive. */
const STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

/**
 * Create a new university. Controlled form (useForm) -> apiPost('/universities')
 * -> on success navigate to the detail page. The API treats every field as
 * optional (see CreateUniversityDto); `country_id` is a free-text string (may
 * hold a comma-separated list of ids), and `year_established` is the only int.
 */
export default function NewUniversityPage() {
  const router = useRouter();
  const { field, values } = useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Build the payload: trim strings, coerce the one int, drop blanks.
    const body = {
      title: toText(values.title),
      country_id: toText(values.country_id),
      accreditation: toText(values.accreditation),
      website: toText(values.website),
      phone: toText(values.phone),
      email: toText(values.email),
      category: toText(values.category),
      year_established: toNumber(values.year_established),
      affiliations: toText(values.affiliations),
      ranking: toText(values.ranking),
      intakes: toText(values.intakes),
      address: toText(values.address),
      state: toText(values.state),
      photo: toText(values.photo),
      status: toText(values.status),
    };

    try {
      const created = await apiPost<University>("/universities", body);
      router.push(`/universities/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to create the university.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New University"
        description="Add a partner institution to the academic catalog."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push("/universities")}
          >
            Back to universities
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
            placeholder="University name"
            required
            wrapperClassName="sm:col-span-2"
          />
          <TextInput
            {...field("country_id")}
            label="Country"
            placeholder="e.g. 1 or 1,5,9"
            hint="Country reference (free text; may be a list)."
          />
          <TextInput
            {...field("state")}
            label="State"
            placeholder="State / region"
          />
          <TextInput
            {...field("category")}
            label="Category"
            placeholder="e.g. Public, Private"
          />
          <TextInput
            {...field("year_established")}
            label="Year established"
            type="number"
            placeholder="e.g. 1965"
          />
          <TextInput
            {...field("website")}
            label="Website"
            placeholder="https://example.edu"
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
            placeholder="name@example.edu"
          />
          <SelectInput
            {...field("status")}
            label="Status"
            options={STATUS_OPTIONS}
            placeholder="Select status…"
          />
          <TextInput
            {...field("ranking")}
            label="Ranking"
            placeholder="e.g. Top 100"
          />
          <TextInput
            {...field("intakes")}
            label="Intakes"
            placeholder="e.g. Fall, Spring"
          />
          <TextInput
            {...field("photo")}
            label="Photo"
            placeholder="Image path / URL"
            wrapperClassName="sm:col-span-2"
          />
          <TextareaInput
            {...field("accreditation")}
            label="Accreditation"
            placeholder="Accrediting bodies…"
            wrapperClassName="sm:col-span-2"
          />
          <TextareaInput
            {...field("affiliations")}
            label="Affiliations"
            placeholder="Affiliated institutions…"
            wrapperClassName="sm:col-span-2"
          />
          <TextareaInput
            {...field("address")}
            label="Address"
            placeholder="Full address…"
            wrapperClassName="sm:col-span-2"
          />

          <FormActions>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/universities")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create university"}
            </Button>
          </FormActions>
        </FormGrid>
      </Card>
    </div>
  );
}
