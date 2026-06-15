"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, ApiError } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import DataTable, { type Column } from "@/components/DataTable";
import { type Teacher, STATUS_ACTIVE } from "./columns";

const PAGE_LIMIT = 20;

const columns: Column<Teacher>[] = [
  {
    key: "id",
    label: "ID",
    align: "right",
    width: "5rem",
    render: (teacher) => (
      <span className="tabular-nums text-ink-400">{teacher.id}</span>
    ),
  },
  {
    key: "name",
    label: "Name",
    render: (teacher) => (
      <Link
        href={`/teachers/${teacher.id}`}
        className="font-medium text-ink hover:text-accent-600 hover:underline"
      >
        {teacher.name || "—"}
      </Link>
    ),
  },
  { key: "username", label: "Username" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  {
    key: "status",
    label: "Status",
    align: "center",
    render: (teacher) => {
      if (teacher.status == null) return <span className="text-ink-400">—</span>;
      const isActive = teacher.status === STATUS_ACTIVE;
      return (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isActive
              ? "bg-emerald-500/[0.08] text-emerald-600"
              : "bg-ink/[0.06] text-ink-400"
          }`}
        >
          {isActive ? "Active" : "Inactive"}
        </span>
      );
    },
  },
  {
    key: "actions",
    label: "",
    align: "right",
    render: (teacher) => (
      <Link
        href={`/teachers/${teacher.id}`}
        className="text-sm font-medium text-accent-600 hover:underline"
      >
        View
      </Link>
    ),
  },
];

export default function TeachersPage() {
  const [rows, setRows] = useState<Teacher[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Paginated<Teacher>>("/teachers", {
        page: targetPage,
        limit: PAGE_LIMIT,
      });
      setRows(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load teachers.",
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
        title="Teachers"
        description="Instructors who deliver sessions on the platform."
        actions={
          <Link href="/teachers/new">
            <Button>New Teacher</Button>
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

      <DataTable<Teacher>
        columns={columns}
        rows={rows}
        page={page}
        limit={PAGE_LIMIT}
        total={total}
        onPage={load}
        loading={loading}
        emptyMessage="No teachers found."
      />
    </div>
  );
}
