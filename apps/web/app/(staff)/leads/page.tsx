"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import type { Lead, Paginated } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DataTable, { type Column } from "@/components/DataTable";

const PAGE_LIMIT = 20;

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

const columns: Column<Lead>[] = [
  {
    key: "title",
    label: "Name",
    render: (lead) => (
      <span className="font-medium text-ink">{lead.title || "—"}</span>
    ),
  },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  {
    key: "lead_status_id",
    label: "Status",
    align: "center",
    render: (lead) =>
      lead.lead_status_id != null ? (
        <span className="inline-flex items-center rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-xs font-medium text-ink-600">
          #{lead.lead_status_id}
        </span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
  },
  {
    key: "created_at",
    label: "Created",
    align: "right",
    render: (lead) => (
      <span className="text-ink-400">{formatDate(lead.created_at)}</span>
    ),
  },
];

export default function LeadsPage() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Paginated<Lead>>("/leads", {
        page: targetPage,
        limit: PAGE_LIMIT,
      });
      setRows(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load leads.",
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
        title="Leads"
        description="Prospects in the CRM funnel that haven't converted yet."
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {error}
        </div>
      )}

      <DataTable<Lead>
        columns={columns}
        rows={rows}
        page={page}
        limit={PAGE_LIMIT}
        total={total}
        onPage={load}
        loading={loading}
        emptyMessage="No leads found."
      />
    </div>
  );
}
