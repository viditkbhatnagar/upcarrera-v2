/**
 * Client-side CSV export for the Counsellors list (QA C03).
 *
 * Exports exactly the rows the screen has after filtering, so the file matches
 * what the operator is looking at. Nothing is sent to the server.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Spreadsheet apps execute a cell that starts with = + - @ (or a tab/CR) as a
 * formula, so such cells get a leading apostrophe (OWASP CSV-injection advice).
 * Stored names and emails are typed by people, so this is not hypothetical.
 */
function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function escapeCell(value: string | number | null | undefined): string {
  const text = guardFormula(value == null ? "" : String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

/** Trigger a browser download. The BOM makes Excel read UTF-8 names correctly. */
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
