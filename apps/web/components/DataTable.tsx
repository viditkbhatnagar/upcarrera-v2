"use client";

import type { ReactNode } from "react";
import Button from "./Button";

/**
 * A column definition for {@link DataTable}.
 *
 * - `key`    — property on the row to read (also the React key for the cell).
 * - `label`  — column header text.
 * - `render` — optional custom cell renderer; receives the whole row.
 * - `align`  — optional text alignment.
 * - `width`  — optional fixed column width (any CSS width value).
 */
export interface Column<Row> {
  key: string;
  label: string;
  render?: (row: Row) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  /** Current 1-based page. */
  page: number;
  /** Page size. */
  limit: number;
  /** Total row count across all pages. */
  total: number;
  /** Called with the new 1-based page when the user paginates. */
  onPage: (page: number) => void;
  /** Show a loading skeleton in place of rows. */
  loading?: boolean;
  /** Optional message shown when there are no rows. */
  emptyMessage?: string;
  /** Optional unique row key extractor (defaults to a row's `id`, else index). */
  rowKey?: (row: Row, index: number) => string | number;
}

const alignClass: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/** Read a possibly-nested value off a row by column key. */
function readCell<Row>(row: Row, column: Column<Row>): ReactNode {
  if (column.render) return column.render(row);
  const value = (row as Record<string, unknown>)[column.key];
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-400">—</span>;
  }
  return String(value);
}

/**
 * Generic, paginated table. Pagination is controlled: this component never owns the
 * page state — it calls `onPage` and the parent re-fetches.
 */
export default function DataTable<Row>({
  columns,
  rows,
  page,
  limit,
  total,
  onPage,
  loading = false,
  emptyMessage = "No records found.",
  rowKey,
}: DataTableProps<Row>) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const getKey = (row: Row, index: number): string | number => {
    if (rowKey) return rowKey(row, index);
    const id = (row as Record<string, unknown>).id;
    return typeof id === "number" || typeof id === "string" ? id : index;
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-ink/[0.04]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/[0.07] bg-ink/[0.015]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-ink-400 ${
                    alignClass[col.align ?? "left"]
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: Math.min(limit, 8) }).map((_, r) => (
                <tr key={r} className="border-b border-ink/[0.05]">
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-4">
                      <span className="block h-3.5 w-full max-w-[8rem] animate-pulse rounded bg-ink/10" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-16 text-center text-sm text-ink-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={getKey(row, index)}
                  className="border-b border-ink/[0.05] transition-colors last:border-0 hover:bg-accent-50/60"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-5 py-3.5 text-ink ${
                        alignClass[col.align ?? "left"]
                      }`}
                    >
                      {readCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] px-5 py-3.5">
        <p className="text-xs text-ink-400">
          {loading ? (
            "Loading…"
          ) : (
            <>
              Showing <span className="font-medium text-ink">{from}</span>–
              <span className="font-medium text-ink">{to}</span> of{" "}
              <span className="font-medium text-ink">{total}</span>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPage(page - 1)}
            disabled={loading || page <= 1}
          >
            Previous
          </Button>
          <span className="px-1 text-xs tabular-nums text-ink-400">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPage(page + 1)}
            disabled={loading || page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
