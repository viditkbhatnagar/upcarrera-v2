// Row model for the Applications list. The API returns raw `applications` rows
// decorated server-side (students.service.decorateApplications) with the effective
// stage, counts and display fields. This module maps one row to the table/CSV
// view; the pipeline cards read the server `counts` directly (no client re-derive).
import type { CsvColumn } from "./export-csv";
import { STAGE_META, type Stage } from "./stage-model";
import type { ApplicationListRow } from "@/lib/api/applications";

export type { Stage } from "@/lib/api/applications";
export type {
  ApplicationListRow,
  ApplicationListResponse,
} from "@/lib/api/applications";

export const EMPTY = "—";
export const PAGE_SIZE = 10;

export interface ListRowView {
  /** applications.application_id — keys, selection, links and API calls. */
  rowId: number;
  /** The printed id (custom_application_id / enrollment_id / APP-{id}). */
  id: string;
  date: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: boolean;
  university: string;
  course: string;
  intake: string;
  counsellor: string;
  counsellorInitials: string;
  stage: Stage;
  stageLabel: string;
  daysInStage: number;
  onHold: boolean;
}

function asText(value: string | null | undefined): string {
  return value != null && String(value).trim() !== "" ? String(value) : EMPTY;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function displayId(r: ApplicationListRow): string {
  return (
    r.custom_application_id?.trim() ||
    r.enrollment_id?.trim() ||
    `APP-${r.application_id}`
  );
}

export function mapRow(r: ApplicationListRow): ListRowView {
  const name = asText(r.applicant_name);
  const counsellor = asText(r.consultant_name);
  return {
    rowId: Number(r.application_id),
    id: displayId(r),
    date: formatDate(r.created_at),
    name,
    email: asText(r.applicant_email),
    phone: r.applicant_phone != null ? String(r.applicant_phone) : "",
    whatsapp: r.whatsapp_no != null && String(r.whatsapp_no).trim() !== "",
    university: asText(r.university_title),
    course: asText(r.course_title),
    // IN04: prefer the v2 intake name; fall back to the legacy session title.
    intake: asText(r.intake_name ?? r.session_title),
    counsellor,
    counsellorInitials: counsellor === EMPTY ? "—" : initials(counsellor),
    stage: r.stage,
    stageLabel: STAGE_META[r.stage]?.label ?? r.stage,
    daysInStage: r.days_in_stage,
    onHold: r.on_hold,
  };
}

export const CSV_COLUMNS: CsvColumn<ListRowView>[] = [
  { header: "Application ID", value: (a) => a.id },
  { header: "Date", value: (a) => a.date },
  { header: "Student", value: (a) => a.name },
  { header: "Email", value: (a) => a.email },
  { header: "Mobile", value: (a) => a.phone },
  { header: "University", value: (a) => a.university },
  { header: "Course", value: (a) => a.course },
  { header: "Intake", value: (a) => a.intake },
  { header: "Counsellor", value: (a) => a.counsellor },
  { header: "Stage", value: (a) => a.stageLabel },
  { header: "Days in stage", value: (a) => String(a.daysInStage) },
  { header: "On hold", value: (a) => (a.onHold ? "Yes" : "No") },
];

export function exportFilename(suffix: string): string {
  return `applications-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
