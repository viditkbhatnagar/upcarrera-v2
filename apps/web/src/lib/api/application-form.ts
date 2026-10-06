// Typed client for the WS5 staff application-form endpoints:
//   GET   /applications/:id/form            -> the structured sections the student submitted
//   PATCH /applications/:id/form/:section   -> an inline staff correction (row_version guarded)
//   GET   /applications/:id/documents/:docId/file -> the scoped document stream
//
// Every shape mirrors ApplicationFormService.buildView (staff read) in apps/api.
import { apiGet, apiPatch, apiFileBlobUrl } from "@/lib/api";

export type FormSection = "personal" | "contact" | "education" | "employment";

export interface PersonalSection {
  name_on_certificate: string | null;
  father_guardian_name: string | null;
  mother_name: string | null;
  category: string | null;
  marital_status: string | null;
  aadhaar_last4: string | null;
  dob: string | null;
  gender: string | null;
  nationality: number | null;
  abc_id: string | null;
}

export interface ContactSection {
  email: string | null; // read-only
  phone: string | null; // read-only
  second_phone: string | null;
  whatsapp_no: string | null;
  address: string | null;
  state: string | null;
  district: string | null;
  pin_code: string | null;
}

export interface EducationRecord {
  id: number;
  level_code: string | null;
  label: string | null;
  institution: string | null;
  board: string | null;
  passing_year: number | null;
  score_type: string | null;
  score_value: number | null;
  score_scale: number | null;
}

export interface EducationSection {
  highest_qualification: string | null;
  records: EducationRecord[];
}

export interface EmploymentHistoryItem {
  employer?: string | null;
  designation?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface EmploymentSection {
  employment_status: string | null;
  total_experience_months: number | null;
  current_employer: string | null;
  current_designation: string | null;
  employment_history: EmploymentHistoryItem[];
}

export interface FormDocFile {
  id: number;
  label: string | null;
  original_name: string | null;
  size_bytes: number | null;
  uploaded_at: string | null;
  verification_status?: string;
  rejection_reason?: string | null;
}

export interface FormChecklistItem {
  requirement_id: number;
  label: string;
  is_required: boolean;
  max_files: number;
  help_text: string | null;
  files: FormDocFile[];
}

export interface ApplicationFormView {
  application_id: string;
  program: {
    university: string | null;
    course: string | null;
    specialisation: string | null;
    intake: string | null;
  };
  counsellor: { name: string | null; email: string | null; phone: string | null };
  sections: {
    personal: PersonalSection;
    contact: ContactSection;
    education: EducationSection;
    employment: EmploymentSection | null;
  };
  employment_required: boolean;
  documents: { checklist: FormChecklistItem[]; other: FormDocFile[] };
  eligibility: { status: string | null; detail: string | null };
  program_change_request: string | null;
  reopen_reason: string | null;
  row_version: number;
  link_expires_at: string | null;
  declaration_accepted_at?: string | null;
}

export function getApplicationForm(id: number) {
  return apiGet<ApplicationFormView>(`/applications/${id}/form`);
}

/** Section data is validated per-section server-side; only changed fields are sent. */
export type SectionPatchData = Record<string, unknown>;

export function patchFormSection(
  id: number,
  section: FormSection,
  data: SectionPatchData,
  rowVersion: number,
) {
  return apiPatch<unknown>(`/applications/${id}/form/${section}`, {
    data,
    row_version: rowVersion,
  });
}

/**
 * Object URL for an auth-gated application document via the SCOPED staff stream
 * (GET /applications/:id/documents/:docId/file) — the record-access-guarded
 * endpoint, not the old /files/application-document path. Caller revokes the URL.
 */
export function applicationDocumentFileUrl(appId: number, docId: number): Promise<string> {
  return apiFileBlobUrl(`/applications/${appId}/documents/${docId}/file`);
}

/** Shared query keys so the form read invalidates with the rest of the detail. */
export const applicationFormKeys = {
  form: (id: number) => ["application", "form", id] as const,
};
