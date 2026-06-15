"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api";
import type { Lead } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";

/** Result payload of POST /leads/:id/convert. */
interface ConvertResult {
  user_id: number;
  student_id: number;
  invoice_count: number;
}

/** Fields surfaced on the detail page, in display order. */
const DETAIL_FIELDS: { key: keyof Lead; label: string }[] = [
  { key: "title", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "country_id", label: "Country ID" },
  { key: "course_id", label: "Course ID" },
  { key: "lead_source_id", label: "Lead source" },
  { key: "lead_status_id", label: "Lead status ID" },
  { key: "remarks", label: "Remarks" },
];

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state, separate from the page-load error.
  const [busy, setBusy] = useState<"convert" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [convertResult, setConvertResult] = useState<ConvertResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Lead>(`/leads/${id}`);
      setLead(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load lead.");
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConvert() {
    setBusy("convert");
    setActionError(null);
    try {
      const result = await apiPost<ConvertResult>(`/leads/${id}/convert`);
      setConvertResult(result);
      // Refresh so converted status is reflected.
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to convert lead.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    setBusy("delete");
    setActionError(null);
    try {
      await apiDelete(`/leads/${id}`);
      router.push("/leads");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to delete lead.",
      );
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={loading ? "Lead" : lead?.title || `Lead #${id}`}
        description="CRM lead detail."
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

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {actionError}
        </div>
      )}

      {convertResult && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          Converted to student #{convertResult.student_id} —{" "}
          {convertResult.invoice_count} invoice
          {convertResult.invoice_count === 1 ? "" : "s"} created.{" "}
          <Link
            href={`/students/${convertResult.student_id}`}
            className="font-medium underline underline-offset-2"
          >
            View student
          </Link>
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
        ) : lead ? (
          <>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {DETAIL_FIELDS.map(({ key, label }) => (
                <div
                  key={String(key)}
                  className={key === "remarks" ? "sm:col-span-2" : undefined}
                >
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-400">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm text-ink">
                    {displayValue(lead[key])}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/[0.07] pt-5">
              <Link href={`/leads/${id}/edit`}>
                <Button variant="secondary">Edit</Button>
              </Link>
              <Button
                onClick={handleConvert}
                disabled={busy !== null || lead.is_converted === 1}
              >
                {busy === "convert"
                  ? "Converting…"
                  : lead.is_converted === 1
                    ? "Already converted"
                    : "Convert to student"}
              </Button>
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
          <p className="text-sm text-ink-400">Lead not found.</p>
        )}
      </Card>
    </div>
  );
}
