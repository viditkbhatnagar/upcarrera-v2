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

/** An invoice record returned by the API (only the fields we edit). */
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

/** payment_status is the invoice_payment_status enum (pending | paid). */
const PAYMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
];

/** Normalise a date-ish value to the YYYY-MM-DD a `<input type="date">` wants. */
function toDateInput(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Turn a fetched invoice into the string-valued form state used by useForm. */
function invoiceToForm(invoice: Invoice): FormValues {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    student_id: str(invoice.student_id),
    course_id: str(invoice.course_id),
    semester_id: str(invoice.semester_id),
    university_id: str(invoice.university_id),
    total_amount: str(invoice.total_amount),
    discount_amount: str(invoice.discount_amount),
    payable_amount: str(invoice.payable_amount),
    payment_status: str(invoice.payment_status),
    date: toDateInput(invoice.date),
    due_date: toDateInput(invoice.due_date),
    remarks: str(invoice.remarks),
  };
}

export default function EditInvoicePage({
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
      const invoice = await apiGet<Invoice>(`/invoices/${id}`);
      setValues(invoiceToForm(invoice));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load invoice.",
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
      student_id: toNumber(values.student_id),
      course_id: toNumber(values.course_id),
      semester_id: toNumber(values.semester_id),
      university_id: toNumber(values.university_id),
      total_amount: toNumber(values.total_amount),
      discount_amount: toNumber(values.discount_amount),
      payable_amount: toNumber(values.payable_amount),
      payment_status: toText(values.payment_status),
      date: toText(values.date),
      due_date: toText(values.due_date),
      remarks: toText(values.remarks),
    };

    try {
      await apiPatch<Invoice>(`/invoices/${id}`, body);
      router.push(`/invoices/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update the invoice.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Edit Invoice"
        description="Update this invoice's details."
        actions={
          <Button
            variant="secondary"
            onClick={() => router.push(`/invoices/${id}`)}
          >
            Back to invoice
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
              {...field("student_id")}
              label="Student ID"
              type="number"
              placeholder="e.g. 42"
              hint="Numeric student reference."
            />
            <TextInput
              {...field("course_id")}
              label="Course ID"
              type="number"
              placeholder="e.g. 12"
              hint="Numeric course reference."
            />
            <TextInput
              {...field("semester_id")}
              label="Semester ID"
              type="number"
              placeholder="e.g. 1"
              hint="Numeric semester reference."
            />
            <TextInput
              {...field("university_id")}
              label="University ID"
              type="number"
              placeholder="e.g. 3"
              hint="Numeric university reference."
            />
            <TextInput
              {...field("total_amount")}
              label="Total amount"
              type="number"
              placeholder="0.00"
            />
            <TextInput
              {...field("discount_amount")}
              label="Discount amount"
              type="number"
              placeholder="0.00"
            />
            <TextInput
              {...field("payable_amount")}
              label="Payable amount"
              type="number"
              placeholder="0.00"
            />
            <SelectInput
              {...field("payment_status")}
              label="Payment status"
              options={PAYMENT_STATUS_OPTIONS}
              placeholder="Select status…"
            />
            <TextInput {...field("date")} label="Date" type="date" />
            <TextInput {...field("due_date")} label="Due date" type="date" />
            <TextareaInput
              {...field("remarks")}
              label="Remarks"
              placeholder="Notes about this invoice…"
              wrapperClassName="sm:col-span-2"
            />

            <FormActions>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/invoices/${id}`)}
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
