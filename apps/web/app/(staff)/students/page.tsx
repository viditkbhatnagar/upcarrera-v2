"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import type { Paginated, Student } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DataTable, { type Column } from "@/components/DataTable";

const PAGE_LIMIT = 20;

/** Legacy admission_status codes -> human labels (best-effort). */
const ADMISSION_STATUS: Record<number, string> = {
  1: "Applied",
  2: "Enrolled",
  3: "Active",
  4: "Completed",
};

const columns: Column<Student>[] = [
  {
    key: "id",
    label: "ID",
    width: "5rem",
    render: (s) => <span className="tabular-nums text-ink-400">#{s.id}</span>,
  },
  {
    key: "student_id",
    label: "Student",
    render: (s) => (
      <span className="font-medium text-ink tabular-nums">{s.student_id}</span>
    ),
  },
  {
    key: "course_id",
    label: "Course",
    render: (s) =>
      s.course_id != null ? (
        <span className="tabular-nums text-ink">#{s.course_id}</span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
  },
  {
    key: "admission_status",
    label: "Admission status",
    align: "center",
    render: (s) =>
      s.admission_status != null ? (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          {ADMISSION_STATUS[s.admission_status] ?? `#${s.admission_status}`}
        </span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
  },
];

export default function StudentsPage() {
  const [rows, setRows] = useState<Student[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Paginated<Student>>("/students", {
        page: targetPage,
        limit: PAGE_LIMIT,
      });
      setRows(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load students.",
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
        title="Students"
        description="Enrolled student records across all courses."
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {error}
        </div>
      )}

      <DataTable<Student>
        columns={columns}
        rows={rows}
        page={page}
        limit={PAGE_LIMIT}
        total={total}
        onPage={load}
        loading={loading}
        emptyMessage="No students found."
      />
    </div>
  );
}
