// Row model for the Applications list: the API row shape, the pipeline-stage
// mapping, display styles and the CSV columns. Split out of
// routes/students.applications.index.tsx to keep the route under the file cap.

import type { CsvColumn } from "./export-csv";

/* ---------------- Types & Data ---------------- */

export type AppStatus =
  | "New Lead"
  | "Registration Fee Pending"
  | "Registration Fee Paid"
  | "Form Pending"
  | "Admin Verification Pending"
  | "Enrolled"
  | "Rejected";

/**
 * What the row can honestly say about the registration fee. Only a converted
 * application has one on record (the convert saga writes a "Registration Fee"
 * payment); for every other row the data is simply not there yet — the Phase 1
 * stage engine adds it. The column used to read applications.paid_date, the
 * legacy COURSE-fee date, and so showed "Paid" on new leads (QA AP08).
 */
export type FeeStatus = "Paid" | "Not recorded";

export interface Application {
  /** applications.application_id — keys, selection, links and API calls. */
  rowId: number;
  /** The printed id (custom_application_id / enrollment_id / APP-{id}) — display only. */
  id: string;
  date: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: boolean;
  university: string;
  course: string;
  batch: string;
  counsellor: string;
  counsellorInitials: string;
  feeStatus: FeeStatus;
  status: AppStatus;
}

export const STATUS_ORDER: AppStatus[] = [
  "New Lead",
  "Registration Fee Pending",
  "Registration Fee Paid",
  "Form Pending",
  "Admin Verification Pending",
  "Enrolled",
  "Rejected",
];

export const STATUS_STYLES: Record<AppStatus, string> = {
  "New Lead": "bg-sky-100 text-sky-700 ring-sky-200",
  "Registration Fee Pending": "bg-orange-100 text-orange-700 ring-orange-200",
  "Registration Fee Paid": "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Form Pending": "bg-purple-100 text-purple-700 ring-purple-200",
  "Admin Verification Pending": "bg-yellow-100 text-yellow-800 ring-yellow-200",
  Enrolled: "bg-primary/10 text-primary ring-primary/20",
  Rejected: "bg-red-100 text-red-700 ring-red-200",
};

export const STATUS_DOT: Record<AppStatus, string> = {
  "New Lead": "bg-sky-500",
  "Registration Fee Pending": "bg-orange-500",
  "Registration Fee Paid": "bg-emerald-500",
  "Form Pending": "bg-purple-500",
  "Admin Verification Pending": "bg-yellow-500",
  Enrolled: "bg-primary",
  Rejected: "bg-red-500",
};

export const FEE_STYLES: Record<FeeStatus, string> = {
  Paid: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Not recorded": "bg-slate-100 text-slate-600 ring-slate-200",
};

/* ---------------- Live API wiring (GET /api/applications) ----------------
 * The list endpoint returns the raw `applications` row decorated server-side with
 * its joined display fields (applications.controller.ts -> students.service.ts
 * listApplications + decorateApplications):
 *   application_id, applicant_name/email/phone, whatsapp_no, custom_application_id,
 *   enrollment_id, created_at, course_title, university_title, session_title,
 *   consultant_name, is_converted, is_archived, status, status_label.
 * Every filter on this page is answered by the server (search, university,
 * course, intake, counsellor, stage), and the stage `counts` cover the whole
 * filtered set, so nothing here refines the ten fetched rows client-side.     */

export const EMPTY = "—";
export const PAGE_SIZE = 10;

export interface ApiApplicationRow {
  application_id: number;
  custom_application_id: string | null;
  enrollment_id: string | null;
  applicant_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  whatsapp_no: string | null;
  created_at: string | null;
  university_title: string | null;
  course_title: string | null;
  session_title: string | null;
  consultant_name: string | null;
  is_converted: number | null;
  is_archived: boolean | null;
  status: boolean | null;
  status_label: string | null;
}

export interface ApplicationsListResponse {
  items: ApiApplicationRow[];
  total: number;
  page: number;
  limit: number;
  /** Stage totals across the whole filtered set (ignoring the stage filter), server-side. */
  counts?: Partial<Record<AppStatus, number>>;
}

export function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Map the API's coarse lifecycle (status_label / is_converted / is_archived /
// status) onto the design's pipeline stages. Converted applications became
// enrolled students; archived/inactive map to Rejected; everything else is a
// live lead. No fabricated intermediate stages — the source row only carries
// these signals. Must match the server's stage filter (applicationStageFilter).
export function toAppStatus(r: ApiApplicationRow): AppStatus {
  if (r.is_converted === 1 || r.status_label === "Converted") return "Enrolled";
  if (r.is_archived || r.status_label === "Archived" || r.status === false) return "Rejected";
  return "New Lead";
}

export function toFeeStatus(r: ApiApplicationRow): FeeStatus {
  return r.is_converted === 1 ? "Paid" : "Not recorded";
}

export function mapApiRow(r: ApiApplicationRow): Application {
  const name = asText(r.applicant_name);
  const counsellor = asText(r.consultant_name);
  const displayId =
    r.custom_application_id != null && String(r.custom_application_id).trim() !== ""
      ? String(r.custom_application_id)
      : r.enrollment_id != null && String(r.enrollment_id).trim() !== ""
        ? String(r.enrollment_id)
        : `APP-${r.application_id}`;
  return {
    rowId: Number(r.application_id),
    id: displayId,
    date: formatDate(r.created_at),
    name,
    email: asText(r.applicant_email),
    phone: r.applicant_phone != null ? String(r.applicant_phone) : "",
    whatsapp: r.whatsapp_no != null && String(r.whatsapp_no).trim() !== "",
    university: asText(r.university_title),
    course: asText(r.course_title),
    // The intake. It used to be formatDate(enrollment_date), which is why the
    // Batch column read "30 Sept 2026" (QA AP08).
    batch: asText(r.session_title),
    counsellor,
    counsellorInitials: counsellor === EMPTY ? "—" : initials(counsellor),
    feeStatus: toFeeStatus(r),
    status: toAppStatus(r),
  };
}

/* ---------------- CSV export ---------------- */

export const CSV_COLUMNS: CsvColumn<Application>[] = [
  { header: "Application ID", value: (a) => a.id },
  { header: "Date", value: (a) => a.date },
  { header: "Student", value: (a) => a.name },
  { header: "Email", value: (a) => a.email },
  { header: "Phone", value: (a) => a.phone },
  { header: "University", value: (a) => a.university },
  { header: "Course", value: (a) => a.course },
  { header: "Intake", value: (a) => a.batch },
  { header: "Counsellor", value: (a) => a.counsellor },
  { header: "Registration Fee", value: (a) => a.feeStatus },
  { header: "Stage", value: (a) => a.status },
];

export function exportFilename(suffix: string): string {
  return `applications-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
