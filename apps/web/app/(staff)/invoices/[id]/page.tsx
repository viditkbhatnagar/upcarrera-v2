"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiGet, apiDelete, ApiError } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";

/** An invoice record returned by the API (only the fields we render). */
interface Invoice {
  id: number;
  student_id: number | null;
  course_id: number | null;
  semester_id: number | null;
  university_id: number | null;
  total_amount: number | null;
  discount_amount: number | null;
  payable_amount: number | null;
  payment_status: string | null;
  date: string | null;
  due_date: string | null;
  remarks: string | null;
  [key: string]: unknown;
}

/** Fields surfaced on the detail page, in display order. */
const DETAIL_FIELDS: { key: keyof Invoice; label: string }[] = [
  { key: "student_id", label: "Student ID" },
  { key: "course_id", label: "Course ID" },
  { key: "semester_id", label: "Semester ID" },
  { key: "university_id", label: "University ID" },
  { key: "total_amount", label: "Total amount" },
  { key: "discount_amount", label: "Discount amount" },
  { key: "payable_amount", label: "Payable amount" },
  { key: "payment_status", label: "Payment status" },
  { key: "date", label: "Date" },
  { key: "due_date", label: "Due date" },
  { key: "remarks", label: "Remarks" },
];

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state, separate from the page-load error.
  const [busy, setBusy] = useState<"delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Invoice>(`/invoices/${id}`);
      setInvoice(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load invoice.",
      );
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
    setBusy("delete");
    setActionError(null);
    try {
      await apiDelete(`/invoices/${id}`);
      router.push("/invoices");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to delete invoice.",
      );
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={loading ? "Invoice" : `Invoice #${id}`}
        description="Fee invoice detail."
        actions={
          <Button variant="secondary" onClick={() => router.push("/invoices")}>
            Back to invoices
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
        ) : invoice ? (
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
                    {displayValue(invoice[key])}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/[0.07] pt-5">
              <Link href={`/invoices/${id}/edit`}>
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
          <p className="text-sm text-ink-400">Invoice not found.</p>
        )}
      </Card>
    </div>
  );
}
