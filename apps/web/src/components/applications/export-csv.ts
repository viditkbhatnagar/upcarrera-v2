// Client-side CSV export for the Applications list (QA AP09).
//
// There is no server export endpoint. The list page fetches the CURRENT
// server-filtered result (every page of it, up to EXPORT_ROW_CAP) and hands the
// rows here, so the file matches what the filters say — not just the ten rows on
// screen.

/** Upper bound on one export; the page says so when a result is larger. */
export const EXPORT_ROW_CAP = 5000;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Quote a cell, and neutralise spreadsheet formula injection: a cell starting
 * with = + - @ (or a tab/CR) is prefixed with an apostrophe so Excel/Sheets show
 * it as text instead of evaluating it.
 */
function cell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(","));
  return lines.join("\r\n");
}

/** Save `csv` as a UTF-8 file (with a BOM so Excel reads non-ASCII names). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
