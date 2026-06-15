"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DataTable, { type Column } from "@/components/DataTable";

const PAGE_LIMIT = 20;

/**
 * A live-class session row (subset of fields the UI uses).
 *
 * The `/sessions` endpoint is backed by the thin `sessions` table: its PK is
 * `session_id` (NOT `id`) and the only business column is `session_title`.
 * teacher_id / student_id / course_id / scheduled_date live on `demo_sessions`,
 * so they are NOT returned here.
 */
interface Session {
  session_id: number;
  session_title: string | null;
  created_at: string | null;
  updated_at: string | null;
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

const columns: Column<Session>[] = [
  {
    key: "session_id",
    label: "ID",
    width: "5rem",
    render: (s) => (
      <span className="tabular-nums text-ink-400">#{s.session_id}</span>
    ),
  },
  {
    key: "session_title",
    label: "Title",
    render: (s) => (
      <span className="font-medium text-ink">{s.session_title || "—"}</span>
    ),
  },
  {
    key: "created_at",
    label: "Created",
    align: "right",
    render: (s) => (
      <span className="text-ink-400">{formatDate(s.created_at)}</span>
    ),
  },
  {
    key: "updated_at",
    label: "Updated",
    align: "right",
    render: (s) => (
      <span className="text-ink-400">{formatDate(s.updated_at)}</span>
    ),
  },
];

export default function SessionsPage() {
  const [rows, setRows] = useState<Session[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Paginated<Session>>("/sessions", {
        page: targetPage,
        limit: PAGE_LIMIT,
      });
      setRows(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load sessions.",
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
        title="Sessions"
        description="Live class sessions scheduled across all courses."
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {error}
        </div>
      )}

      <DataTable<Session>
        columns={columns}
        rows={rows}
        page={page}
        limit={PAGE_LIMIT}
        total={total}
        onPage={load}
        loading={loading}
        emptyMessage="No sessions found."
        rowKey={(s) => s.session_id}
      />
    </div>
  );
}
