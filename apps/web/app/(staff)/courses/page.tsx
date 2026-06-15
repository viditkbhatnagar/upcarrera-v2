"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import type { Paginated } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import DataTable, { type Column } from "@/components/DataTable";

const PAGE_LIMIT = 20;

/** A course row (subset of fields the UI uses). Mirrors the `course` Prisma model. */
interface Course {
  id: number;
  title: string | null;
  short_name: string | null;
  stream: string | null;
  level: string | null;
  university_id: number | null;
  [key: string]: unknown;
}

const columns: Column<Course>[] = [
  {
    key: "id",
    label: "ID",
    align: "right",
    width: "5rem",
    render: (course) => (
      <span className="tabular-nums text-ink-400">{course.id}</span>
    ),
  },
  {
    key: "title",
    label: "Title",
    render: (course) => (
      <span className="font-medium text-ink">{course.title || "—"}</span>
    ),
  },
  { key: "short_name", label: "Short Name" },
  { key: "stream", label: "Stream" },
  { key: "level", label: "Level" },
  {
    key: "university_id",
    label: "University",
    align: "center",
    render: (course) =>
      course.university_id != null ? (
        <span className="inline-flex items-center rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-xs font-medium text-ink-600">
          #{course.university_id}
        </span>
      ) : (
        <span className="text-ink-400">—</span>
      ),
  },
];

export default function CoursesPage() {
  const [rows, setRows] = useState<Course[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Paginated<Course>>("/courses", {
        page: targetPage,
        limit: PAGE_LIMIT,
      });
      setRows(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load courses.",
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
        title="Courses"
        description="Programmes offered across universities in the catalogue."
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-accent/20 bg-accent-50 px-4 py-3 text-sm text-accent-600"
        >
          {error}
        </div>
      )}

      <DataTable<Course>
        columns={columns}
        rows={rows}
        page={page}
        limit={PAGE_LIMIT}
        total={total}
        onPage={load}
        loading={loading}
        emptyMessage="No courses found."
      />
    </div>
  );
}
