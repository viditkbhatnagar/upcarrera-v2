/**
 * Tiny dependency-free CSV serializer for the reporting endpoints.
 *
 * Kept deliberately minimal (RFC-4180-ish): fields containing a comma,
 * double-quote, or newline are wrapped in double quotes and any embedded
 * quotes are doubled. No streaming — report result sets are small aggregates.
 */

/** A single CSV cell value before stringification. */
export type CsvValue = string | number | boolean | null | undefined;

/** One CSV row keyed by column name. */
export type CsvRow = Record<string, CsvValue>;

/**
 * Neutralize CSV formula injection: a spreadsheet treats a cell beginning with
 * =, +, -, @ (or a leading tab / carriage return) as a formula, so an untrusted
 * string starting with one is prefixed with a single quote. Applied to STRING
 * cells only — numbers and booleans are not attacker-controlled and must not be
 * mangled (e.g. a negative number stays a number).
 */
function neutralizeFormula(str: string): string {
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = typeof value === 'string' ? neutralizeFormula(value) : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialize an array of row objects to a CSV string.
 *
 * Columns are taken from `headers` when provided, otherwise inferred from the
 * keys of the first row. Always emits a header line so an empty result set
 * still produces a usable (header-only) file when headers are known.
 */
export function toCsv(rows: CsvRow[], headers?: string[]): string {
  const columns = headers ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  const headerLine = columns.map(escapeCell).join(',');
  const dataLines = rows.map((row) =>
    columns.map((col) => escapeCell(row[col])).join(','),
  );
  return [headerLine, ...dataLines].join('\r\n');
}
