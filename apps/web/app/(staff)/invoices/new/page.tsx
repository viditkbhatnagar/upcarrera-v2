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

/** What the API returns for a single invoice (minimal shape we rely on). */
interface Invoice {
  id: number;
  [key: string]: unknown;
}

/** payment_status is the invoice_payment_status enum (pending | paid). */
const PAYMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
];

/**
 * Create a new fee invoice. Controlled form (useForm) -> apiPost('/invoices') ->
 * on success navigate to the detail page. The API treats almost every field as
 * optional (see CreateInvoiceDto), so this is a light form; FK ids are free-typed
 * numbers for now (no lookup endpoints wired yet) and money fields are numbers.
 */
export default function NewInvoicePage() {
  const router = useRouter();
  const { field, values } = useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Build the payload: coerce FK ids + money to numbers, dates as ISO strings,
    // and drop blanks so the API keeps its defaults.
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
      const created = await apiPost<Invoice>("/invoices", body);
      router.push(`/invoices/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create the invoice.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Invoice"
        description="Raise a fee invoice for a student."
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

      <Card className="max-w-3xl p-6">
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
              onClick={() => router.push("/invoices")}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create invoice"}
            </Button>
          </FormActions>
        </FormGrid>
      </Card>
    </div>
  );
}
