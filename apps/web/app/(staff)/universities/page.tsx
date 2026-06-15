"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, ApiError } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import DataTable, { type Column } from "@/components/DataTable";

const PAGE_LIMIT = 20;

/** A university catalog row (subset of fields the UI uses). */
interface University {
  id: number;
  title: string | null;
  country_id: string | null;
  category: string | null;
  status: string | null;
  created_at: string | null;
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

const columns: Column<University>[] = [
  {
    key: "title",
    label: "Name",
    render: (university) => (
      <Link
        href={`/universities/${university.id}`}
        className="font-medium text-ink hover:text-accent-600 hover:underline"
      >
        {university.title || "—"}
      </Link>
    ),
  },
  { key: "country_id", label: "Country" },
  { key: "category", label: "Category" },
  {
    key: "status",
    label: "Status",
    align: "center",
    render: (university) =>
      university.status != null && university.status !== "" ? (
        <span className="inline-flex items-center rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-xs font-medium text-ink-600">
          {university.status}
        </span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
  },
  {
    key: "created_at",
    label: "Created",
    align: "right",
    render: (university) => (
      <span className="text-ink-400">{formatDate(university.created_at)}</span>
    ),
  },
  {
    key: "actions",
    label: "",
    align: "right",
    render: (university) => (
      <Link
        href={`/universities/${university.id}`}
        className="text-sm font-medium text-accent-600 hover:underline"
      >
        View
      </Link>
    ),
  },
];

export default function UniversitiesPage() {
  const [rows, setRows] = useState<University[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Paginated<University>>("/universities", {
        page: targetPage,
        limit: PAGE_LIMIT,
      });
      setRows(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load universities.",
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
        title="Universities"
        description="Partner institutions in the academic catalog."
        actions={
          <Link href="/universities/new">
            <Button>New University</Button>
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

      <DataTable<University>
        columns={columns}
        rows={rows}
        page={page}
        limit={PAGE_LIMIT}
        total={total}
        onPage={load}
        loading={loading}
        emptyMessage="No universities found."
      />
    </div>
  );
}
