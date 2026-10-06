// Typed client for the WS6 Master Settings endpoints:
//   /document-requirements      (the per-canonical-level document checklist)
//   /course-admission-rules     (the per-course eligibility rule)
//   /document-types             (the picker master; read is open to staff)
//
// Reads carry crm:catalog.view and writes crm:catalog.manage server-side.
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

export const CANONICAL_COURSE_LEVELS = [
  "certification",
  "diploma",
  "ug",
  "pg",
  "doctorate",
] as const;
export type CanonicalCourseLevel = (typeof CANONICAL_COURSE_LEVELS)[number];

export const COURSE_LEVEL_LABELS: Record<CanonicalCourseLevel, string> = {
  certification: "Certification",
  diploma: "Diploma",
  ug: "Undergraduate",
  pg: "Postgraduate",
  doctorate: "Doctorate",
};

export const MIN_QUALIFICATION_LEVELS = [
  "10th",
  "12th",
  "diploma",
  "ug",
  "pg",
  "doctorate",
] as const;
export type MinQualificationLevel = (typeof MIN_QUALIFICATION_LEVELS)[number];

export const APPLIES_WHEN_OPTIONS = ["always", "employment"] as const;
export type AppliesWhenOption = (typeof APPLIES_WHEN_OPTIONS)[number];

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/* ---------------- document_requirement ---------------- */

export interface DocumentRequirement {
  id: number;
  course_level: string;
  document_type_id: number;
  document_type_title: string | null;
  is_required: boolean;
  applies_when: string | null;
  max_files: number;
  help_text: string | null;
  sort_order: number;
}

export interface DocumentRequirementInput {
  course_level: string;
  document_type_id: number;
  is_required?: boolean;
  applies_when?: string; // 'always' | 'employment'
  max_files?: number;
  help_text?: string | null;
  sort_order?: number;
}

export function listDocumentRequirements(courseLevel?: string) {
  return apiGet<Paged<DocumentRequirement>>("/document-requirements", {
    course_level: courseLevel,
    limit: 500,
  });
}

export function createDocumentRequirement(body: DocumentRequirementInput) {
  return apiPost<DocumentRequirement>("/document-requirements", body);
}

export function updateDocumentRequirement(
  id: number,
  body: Partial<DocumentRequirementInput>,
) {
  return apiPatch<DocumentRequirement>(`/document-requirements/${id}`, body);
}

export function deleteDocumentRequirement(id: number) {
  return apiDelete<unknown>(`/document-requirements/${id}`);
}

/* ---------------- course_admission_rule ---------------- */

export interface AdmissionRule {
  id: number;
  course_id: number;
  course_title: string | null;
  min_qualification: string | null;
  min_percentage: number | null;
  min_cgpa: number | null;
  requires_employment: boolean;
  min_experience_months: number | null;
  notes: string | null;
}

export interface AdmissionRuleInput {
  course_id: number;
  min_qualification?: string | null;
  min_percentage?: number | null;
  min_cgpa?: number | null;
  requires_employment?: boolean;
  min_experience_months?: number | null;
  notes?: string | null;
}

export function listAdmissionRules(courseId?: number) {
  return apiGet<Paged<AdmissionRule>>("/course-admission-rules", {
    course_id: courseId,
    limit: 500,
  });
}

export function createAdmissionRule(body: AdmissionRuleInput) {
  return apiPost<AdmissionRule>("/course-admission-rules", body);
}

export function updateAdmissionRule(
  id: number,
  body: Partial<Omit<AdmissionRuleInput, "course_id">>,
) {
  return apiPatch<AdmissionRule>(`/course-admission-rules/${id}`, body);
}

export function deleteAdmissionRule(id: number) {
  return apiDelete<unknown>(`/course-admission-rules/${id}`);
}

/* ---------------- document_type (picker) ---------------- */

export interface DocumentTypeOption {
  id: number;
  title: string | null;
}

export function listDocumentTypes() {
  return apiGet<Paged<DocumentTypeOption>>("/document-types", { limit: 500 });
}

/* ---------------- query keys ---------------- */

export const masterSettingsKeys = {
  requirements: (level?: string) => ["master-settings", "requirements", level ?? "all"] as const,
  rules: (courseId?: number) => ["master-settings", "rules", courseId ?? "all"] as const,
  documentTypes: ["master-settings", "document-types"] as const,
};
