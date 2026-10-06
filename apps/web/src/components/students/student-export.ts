// CSV export for the Students list (QA ST04).
//
// The Export button had no handler. It now fetches every row matching the
// list's CURRENT server-side filters (status + search), page by page up to
// EXPORT_ROW_CAP, and the list page saves them as CSV — so the file matches what
// the filters say, not just the twelve rows on screen.

import { apiGet } from "@/lib/api";
import { EXPORT_ROW_CAP, type CsvColumn } from "@/components/applications/export-csv";

/** Rows fetched per request while exporting; the API pages GET /students. */
const EXPORT_PAGE_SIZE = 500;

/** The fields of a GET /students row the export writes. */
export interface ExportStudentRow {
  id: number | string;
  student_id: number | string | null;
  enrollment_id: string | null;
  application_id: number | string | null;
  enrollment_date: string | null;
  whatsapp_no: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  consultant_name: string | null;
  course_title: string | null;
  university_title: string | null;
  specialisation_title: string | null;
  session_title: string | null;
  admission_status_label: string | null;
}

/** The printed id: enrollment_id, else STU-<student_id> — the same one the list shows. */
function printedId(r: ExportStudentRow): string {
  return r.enrollment_id != null && String(r.enrollment_id).trim() !== ""
    ? String(r.enrollment_id)
    : `STU-${r.student_id ?? r.id}`;
}

export const STUDENT_EXPORT_COLUMNS: CsvColumn<ExportStudentRow>[] = [
  { header: "Student ID", value: printedId },
  { header: "Name", value: (r) => r.name },
  { header: "Email", value: (r) => r.email },
  { header: "Phone", value: (r) => r.phone },
  { header: "WhatsApp", value: (r) => r.whatsapp_no },
  { header: "University", value: (r) => r.university_title },
  { header: "Course", value: (r) => r.course_title },
  { header: "Specialisation", value: (r) => r.specialisation_title },
  { header: "Session", value: (r) => r.session_title },
  { header: "Enrollment Date", value: (r) => (r.enrollment_date ?? "").slice(0, 10) },
  { header: "Consultant", value: (r) => r.consultant_name },
  { header: "Status", value: (r) => r.admission_status_label },
  { header: "Application ID", value: (r) => r.application_id },
];

interface Page<T> {
  items: T[];
  total: number;
}

/** Every row matching `filters`, capped at EXPORT_ROW_CAP; `total` is the full match count. */
export async function fetchAllStudents<R extends Page<ExportStudentRow>>(
  filters: Record<string, string | number | undefined>,
): Promise<{ rows: R["items"]; total: number }> {
  const rows: R["items"] = [];
  let total = 0;
  for (let page = 1; rows.length < EXPORT_ROW_CAP; page += 1) {
    const res = await apiGet<R>("/students", { ...filters, page, limit: EXPORT_PAGE_SIZE });
    total = res.total;
    rows.push(...res.items);
    if (res.items.length < EXPORT_PAGE_SIZE || rows.length >= total) break;
  }
  return { rows: rows.slice(0, EXPORT_ROW_CAP), total };
}
