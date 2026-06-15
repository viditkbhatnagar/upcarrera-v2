"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete, ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";

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

/** Fields surfaced on the detail page, in display order. */
const DETAIL_FIELDS: { key: keyof University; label: string; wide?: boolean }[] =
  [
    { key: "title", label: "Name" },
    { key: "country_id", label: "Country" },
    { key: "state", label: "State" },
    { key: "category", label: "Category" },
    { key: "year_established", label: "Year established" },
    { key: "website", label: "Website" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "ranking", label: "Ranking" },
    { key: "intakes", label: "Intakes" },
    { key: "accreditation", label: "Accreditation", wide: true },
    { key: "affiliations", label: "Affiliations", wide: true },
    { key: "address", label: "Address", wide: true },
    { key: "photo", label: "Photo", wide: true },
  ];

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** Legacy `status` is a 1-char flag: "1" = active, "0" = inactive. */
function statusLabel(value: unknown): string {
  if (value === "1" || value === 1) return "Active";
  if (value === "0" || value === 0) return "Inactive";
  return "—";
}

export default function UniversityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;

  const [university, setUniversity] = useState<University | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state, separate from the page-load error.
  const [busy, setBusy] = useState<"delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<University>(`/universities/${id}`);
      setUniversity(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load university.",
      );
      setUniversity(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!window.confirm("Delete this university? This cannot be undone.")) return;
    setBusy("delete");
    setActionError(null);
    try {
      await apiDelete(`/universities/${id}`);
      router.push("/universities");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to delete university.",
      );
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={loading ? "University" : university?.title || `University #${id}`}
        description="Partner institution detail."
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

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {actionError}
        </div>
      )}

      <Card className="max-w-3xl p-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-5 w-full max-w-sm animate-pulse rounded bg-ink/10"
              />
            ))}
          </div>
        ) : university ? (
          <>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {DETAIL_FIELDS.map(({ key, label, wide }) => (
                <div key={String(key)} className={wide ? "sm:col-span-2" : undefined}>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-400">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm text-ink">
                    {displayValue(university[key])}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-400">
                  Status
                </dt>
                <dd className="mt-1 text-sm text-ink">
                  {statusLabel(university.status)}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/[0.07] pt-5">
              <Link href={`/universities/${id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={busy !== null}
                className="text-accent-600 hover:bg-accent-50"
              >
                {busy === "delete" ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-400">University not found.</p>
        )}
      </Card>
    </div>
  );
}
