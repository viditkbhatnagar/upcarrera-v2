"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, ApiError } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import DataTable, { type Column } from "@/components/DataTable";

const PAGE_LIMIT = 20;

/** An invoice row (subset of the fields the API returns). */
interface Invoice {
  id: number;
  student_id: number | null;
  course_id: number | null;
  payable_amount: number | null;
  payment_status: string | null;
  date: string | null;
  [key: string]: unknown;
}

/** Render a numeric timestamp/string as a short local date. */
function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = new Date(value as string);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** Render a numeric amount with two fixed decimals. */
function formatAmount(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isNaN(amount)
    ? "—"
    : amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

const columns: Column<Invoice>[] = [
  {
    key: "id",
    label: "Invoice",
    render: (invoice) => (
      <Link
        href={`/invoices/${invoice.id}`}
        className="font-medium text-ink hover:text-accent-600 hover:underline"
      >
        #{invoice.id}
      </Link>
    ),
  },
  {
    key: "student_id",
    label: "Student",
    render: (invoice) =>
      invoice.student_id != null ? (
        <span className="text-ink">#{invoice.student_id}</span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
  },
  {
    key: "course_id",
    label: "Course",
    render: (invoice) =>
      invoice.course_id != null ? (
        <span className="text-ink">#{invoice.course_id}</span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
  },
  {
    key: "payable_amount",
    label: "Payable",
    align: "right",
    render: (invoice) => (
      <span className="tabular-nums text-ink">
        {formatAmount(invoice.payable_amount)}
      </span>
    ),
  },
  {
    key: "payment_status",
    label: "Status",
    align: "center",
    render: (invoice) =>
      invoice.payment_status === "paid" ? (
        <span className="inline-flex items-center rounded-full bg-emerald-500/[0.08] px-2.5 py-0.5 text-xs font-medium text-emerald-600">
          Paid
        </span>
      ) : invoice.payment_status ? (
        <span className="inline-flex items-center rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-xs font-medium text-ink-600">
          Pending
        </span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
  },
  {
    key: "date",
    label: "Date",
    align: "right",
    render: (invoice) => (
      <span className="text-ink-400">{formatDate(invoice.date)}</span>
    ),
  },
  {
    key: "actions",
    label: "",
    align: "right",
    render: (invoice) => (
      <Link
        href={`/invoices/${invoice.id}`}
        className="text-sm font-medium text-accent-600 hover:underline"
      >
        View
      </Link>
    ),
  },
];

export default function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Paginated<Invoice>>("/invoices", {
        page: targetPage,
        limit: PAGE_LIMIT,
      });
      setRows(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load invoices.",
      );
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Student fee invoices and their payment status."
        actions={
          <Link href="/invoices/new">
            <Button>New Invoice</Button>
          </Link>
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

      <DataTable<Invoice>
        columns={columns}
        rows={rows}
        page={page}
        limit={PAGE_LIMIT}
        total={total}
        onPage={load}
        loading={loading}
        emptyMessage="No invoices found."
      />
    </div>
  );
}
