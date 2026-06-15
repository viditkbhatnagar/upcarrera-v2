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
  TextareaInput,
  useForm,
  toNumber,
  toText,
  type FormValues,
} from "@/components/form";

/** A university catalog row returned by the API. */
interface University {
  id: number;
  title: string | null;
  country_id: string | null;
  accreditation: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  year_established: number | null;
  affiliations: string | null;
  ranking: string | null;
  intakes: string | null;
  address: string | null;
  state: string | null;
  photo: string | null;
  status: string | null;
  [key: string]: unknown;
}

/** Legacy `status` is a 1-char flag: "1" = active, "0" = inactive. */
const STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

/** Turn a fetched university into the string-valued form state used by useForm. */
function universityToForm(u: University): FormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    title: str(u.title),
    country_id: str(u.country_id),
    accreditation: str(u.accreditation),
    website: str(u.website),
    phone: str(u.phone),
    email: str(u.email),
    category: str(u.category),
    year_established: str(u.year_established),
    affiliations: str(u.affiliations),
    ranking: str(u.ranking),
    intakes: str(u.intakes),
    address: str(u.address),
    state: str(u.state),
    photo: str(u.photo),
    status: str(u.status),
  };
}

export default function EditUniversityPage({
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
      const u = await apiGet<University>(`/universities/${id}`);
      setValues(universityToForm(u));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load university.",
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
      await apiPatch<University>(`/universities/${id}`, body);
      router.push(`/universities/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to update the university.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit University"
        description="Update this institution's details."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push(`/universities/${id}`)}
          >
            Back to university
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
                onClick={() => router.push(`/universities/${id}`)}
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
