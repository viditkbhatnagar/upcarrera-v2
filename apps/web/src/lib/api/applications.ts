// Typed client for the Phase 1 admissions workflow (WS1).
//
// Every shape here mirrors a COMMITTED controller/service in apps/api:
//   - applications.controller.ts / students.service.ts (detail, list, counts)
//   - application-workflow.controller.ts (timeline, documents, payments, actions)
//   - application-payments.controller.ts (Accounts queue, verify/mismatch, proof)
//   - sa-review.service.ts (per-document review, the SA decision)
//   - me-access.controller.ts (sidebar/list gating)
//
// The server is the authority: it enforces record access and derives every stage.
// The UI never hard-codes which actions are allowed — it renders `allowed_actions`.
import {
  apiGet,
  apiPost,
  apiPatch,
  apiUpload,
  apiFileBlobUrl,
} from "@/lib/api";

/* ------------------------------------------------------------------ *
 * Stages (migration 002 — derived, never stored past `stage`).
 * ------------------------------------------------------------------ */

export const STAGES = [
  "lead_added",
  "form_pending",
  "counsellor_review",
  "fee_pending",
  "fee_verification",
  "sa_verification",
  "converted",
  "rejected",
] as const;

export type Stage = (typeof STAGES)[number];

/** The derived stage number the UI shows (rejected is the terminal 0). */
export const STAGE_NO: Readonly<Record<Stage, number>> = {
  lead_added: 1,
  form_pending: 2,
  counsellor_review: 3,
  fee_pending: 4,
  fee_verification: 5,
  sa_verification: 6,
  converted: 7,
  rejected: 0,
};

/**
 * Every workflow action string the server can surface in `allowed_actions`.
 * `send_back` and `reject` are the two Student-Affairs decisions the stage engine
 * emits at `sa_verification` alongside `approve` (see apps/api stages.ts
 * TRANSITIONS); they are surfaced inside the SA review dialog (opened by `approve`),
 * not as standalone action-bar buttons — see ACTION_META in stage-model.ts.
 */
export type WorkflowAction =
  | "send_form"
  | "mark_form_received"
  | "accept"
  | "reopen"
  | "correct"
  | "record_payment"
  | "verify"
  | "mismatch"
  | "hold"
  | "resume"
  | "approve"
  | "send_back"
  | "reject"
  | "convert";

export type PaymentStatus = "pending" | "verified" | "mismatch" | "void";
export type DocVerification = "pending" | "verified" | "rejected" | null;
export type PaidToCode = "upcarrera" | "university";
export type PaymentModeCode =
  | "upi"
  | "neft"
  | "imps"
  | "rtgs"
  | "cheque"
  | "dd"
  | "card"
  | "cash";

/* ------------------------------------------------------------------ *
 * Shared primitives.
 * ------------------------------------------------------------------ */

/** Prisma Decimal serialises to a string; money fields may arrive either way. */
export type Money = number | string | null;

export interface Paged<T> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

/* ------------------------------------------------------------------ *
 * GET /applications/:id — the Summary payload (decorated row + workflow).
 * ------------------------------------------------------------------ */

export interface ApplicationHold {
  at: string | null;
  followup_date: string | null;
  reason: string | null;
  by: number | null;
}

export interface ApplicationDetail {
  application_id: number;
  custom_application_id: string | null;
  enrollment_id: string | null;

  // Applicant identity (lives on the application row until conversion).
  name: string | null;
  email: string | null;
  phone: string | null;
  applicant_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  second_phone: string | null;
  whatsapp_no: string | null;
  dob: string | null;
  gender: string | null;
  state: string | null;
  district: string | null;
  address: string | null;
  abc_id: string | null;
  source: string | null;
  remarks: string | null;
  profile_picture: string | null;

  // Programme + owner (resolved titles; raw ids never rendered).
  consultant_id: number | null;
  consultant_name: string | null;
  course_id: number | null;
  course_title: string | null;
  university_id: number | null;
  university_title: string | null;
  session_id: number | null;
  session_title: string | null;
  // IN04: the v2 intake master. intake_name resolves from intake_id (intake.name),
  // falling back to session_title for legacy rows that predate intake_id.
  intake_id: number | null;
  intake_name: string | null;

  // Legacy fee columns (read-only block on the fee tab; mirrored on verify).
  amount: Money;
  paid_date: string | null;
  payment_mode: string | null;
  payment_to: string | null;
  fee_receipt: string | null;

  status_label: string | null;
  created_at: string | null;

  // Phase 1 stage engine.
  stage: Stage;
  effective_stage: Stage;
  stage_no: number;
  stage_source: "workflow" | "legacy";
  on_hold: boolean;
  days_in_stage: number;
  hold: ApplicationHold | null;
  owner: { consultant_id: number | null; consultant_name: string | null };
  allowed_actions: WorkflowAction[];
}

export function getApplication(id: number) {
  return apiGet<ApplicationDetail>(`/applications/${id}`);
}

/* ------------------------------------------------------------------ *
 * GET /applications — list rows + stage counts.
 * ------------------------------------------------------------------ */

export interface ApplicationListRow {
  application_id: number;
  custom_application_id: string | null;
  enrollment_id: string | null;
  applicant_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  whatsapp_no: string | null;
  created_at: string | null;
  university_id: number | null;
  university_title: string | null;
  course_title: string | null;
  session_title: string | null;
  // IN04: intake.name (from intake_id), falling back to session_title for legacy rows.
  intake_id: number | null;
  intake_name: string | null;
  consultant_id: number | null;
  consultant_name: string | null;
  stage: Stage;
  stage_no: number;
  stage_source: "workflow" | "legacy";
  on_hold: boolean;
  days_in_stage: number;
  status_label: string | null;
}

export interface ApplicationListResponse {
  items: ApplicationListRow[];
  total: number;
  page: number;
  limit: number;
  counts: Record<Stage, number>;
  on_hold: number;
}

export interface ApplicationListParams {
  page?: number;
  limit?: number;
  search?: string;
  university_id?: number | string;
  course_id?: number | string;
  session_id?: number | string;
  consultant_id?: number | string;
  team_id?: number | string;
  group_id?: number | string;
  stage?: Stage;
  on_hold?: "true";
  followup_due?: "true";
  date_from?: string;
  date_to?: string;
}

type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function listApplications(params: ApplicationListParams) {
  return apiGet<ApplicationListResponse>("/applications", params as QueryParams);
}

/* ------------------------------------------------------------------ *
 * GET /applications/:id/timeline — stage log + field audit + legacy.
 * ------------------------------------------------------------------ */

export interface TimelineEntry {
  source: "stage_log" | "audit" | "legacy";
  at: string | null;
  event: string;
  from_stage?: string | null;
  to_stage?: string | null;
  actor_id?: number | null;
  reason?: string | null;
  ref_table?: string | null;
  ref_id?: number | null;
  entity?: string | null;
  field?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  change_id?: string | null;
}

export function getTimeline(id: number) {
  return apiGet<Paged<TimelineEntry>>(`/applications/${id}/timeline`);
}

/* ------------------------------------------------------------------ *
 * GET /applications/:id/documents — documents + SA review state.
 * ------------------------------------------------------------------ */

export interface ApplicationDocument {
  id: number;
  label: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  verification_status: DocVerification;
  reviewed_by: number | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  download_url: string;
  created_at: string | null;
}

export function getDocuments(id: number) {
  return apiGet<Paged<ApplicationDocument>>(`/applications/${id}/documents`);
}

/* ------------------------------------------------------------------ *
 * GET /applications/:id/payments — registration-fee entries + legacy fee.
 * ------------------------------------------------------------------ */

export interface ApplicationPayment {
  id: number;
  application_id: number;
  fee_kind: string | null;
  amount_expected: Money;
  amount: Money;
  amount_change_reason: string | null;
  paid_to: string | null;
  payment_mode: string | null;
  txn_ref: string | null;
  paid_on: string | null;
  status: PaymentStatus;
  proof_url: string;
  proof_mime: string | null;
  proof_original_name: string | null;
  entered_by: number | null;
  entered_at: string | null;
  verified_by: number | null;
  verified_at: string | null;
  bank_credit_date: string | null;
  verify_note: string | null;
  mismatch_by: number | null;
  mismatch_at: string | null;
  mismatch_reason: string | null;
  created_at: string | null;
}

export interface LegacyFee {
  amount: Money;
  paid_date: string | null;
  payment_mode: string | null;
  payment_to: string | null;
  fee_receipt: string | null;
}

export interface ApplicationPaymentsResponse {
  items: ApplicationPayment[];
  total: number;
  legacy_fee: LegacyFee;
}

export function getPayments(id: number) {
  return apiGet<ApplicationPaymentsResponse>(`/applications/${id}/payments`);
}

/* ------------------------------------------------------------------ *
 * Workflow actions (the server enforces owner/stage on every one).
 * ------------------------------------------------------------------ */

export interface StageResult {
  application_id: number;
  stage?: string;
  on_hold?: boolean;
  corrected?: number;
  change_id?: string;
}

export const sendForm = (id: number) =>
  apiPost<StageResult>(`/applications/${id}/send-form`);

export const markFormReceived = (id: number) =>
  apiPost<StageResult>(`/applications/${id}/mark-form-received`);

export const acceptApplication = (id: number) =>
  apiPost<StageResult>(`/applications/${id}/accept`, {});

export const reopenApplication = (id: number, reason: string) =>
  apiPost<StageResult>(`/applications/${id}/reopen`, { reason });

export const holdApplication = (
  id: number,
  body: { reason: string; followup_date: string },
) => apiPost<StageResult>(`/applications/${id}/hold`, body);

export const resumeApplication = (id: number, reason?: string) =>
  apiPost<StageResult>(`/applications/${id}/resume`, reason ? { reason } : {});

export const convertApplication = (id: number) =>
  apiPost<StageResult>(`/applications/${id}/convert`);

/** The whitelisted applicant-field corrections (counsellor review only). */
export interface CorrectionBody {
  name?: string;
  email?: string;
  phone?: string;
  second_phone?: string;
  whatsapp_no?: string;
  dob?: string;
  gender?: string;
  state?: string;
  district?: string;
  address?: string;
  abc_id?: string;
  source?: string;
  remarks?: string;
}

export const correctApplication = (id: number, body: CorrectionBody) =>
  apiPatch<StageResult>(`/applications/${id}/corrections`, body);

/** POST /applications/:id/payments — multipart registration-fee entry + proof. */
export interface RecordPaymentFields {
  amount: number;
  paid_to: PaidToCode;
  payment_mode: PaymentModeCode;
  txn_ref: string;
  paid_on: string;
  amount_change_reason?: string;
}

export function recordPayment(
  id: number,
  fields: RecordPaymentFields,
  proof: File,
) {
  const form = new FormData();
  form.append("amount", String(fields.amount));
  form.append("paid_to", fields.paid_to);
  form.append("payment_mode", fields.payment_mode);
  form.append("txn_ref", fields.txn_ref);
  form.append("paid_on", fields.paid_on);
  if (fields.amount_change_reason?.trim()) {
    form.append("amount_change_reason", fields.amount_change_reason.trim());
  }
  form.append("proof", proof);
  return apiUpload<ApplicationPayment>(`/applications/${id}/payments`, form);
}

/** SA per-document verdict. */
export const reviewDocument = (
  id: number,
  documentId: number,
  body: { status: "verified" | "rejected"; reason?: string },
) =>
  apiPost<ApplicationDocument>(
    `/applications/${id}/documents/${documentId}/review`,
    body,
  );

/** The SA decision — the four checks plus approve / send_back / reject. */
export interface SaReviewBody {
  identity_ok?: boolean;
  eligibility_ok?: boolean;
  legible_ok?: boolean;
  program_ok?: boolean;
  decision: "approve" | "send_back" | "reject";
  reason?: string;
}

export const saReview = (id: number, body: SaReviewBody) =>
  apiPost<{ decision: string; student_no?: string }>(
    `/applications/${id}/sa-review`,
    body,
  );

/* ------------------------------------------------------------------ *
 * Accounts registration-fee queue (GET /application-payments).
 * ------------------------------------------------------------------ */

export interface QueuePayment extends ApplicationPayment {
  display_id: string;
  applicant_name: string | null;
  applicant_phone: string | null;
  consultant_id: number | null;
  consultant_name: string | null;
}

export interface PaymentQueueParams {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
  date_from?: string;
  date_to?: string;
  paid_to?: PaidToCode;
  payment_mode?: PaymentModeCode;
  search?: string;
}

export function listApplicationPayments(params: PaymentQueueParams) {
  return apiGet<Paged<QueuePayment>>("/application-payments", params as QueryParams);
}

export const verifyPayment = (
  id: number,
  body: { bank_credit_date?: string; verify_note?: string },
) => apiPost<ApplicationPayment>(`/application-payments/${id}/verify`, body);

export const mismatchPayment = (id: number, reason: string) =>
  apiPost<ApplicationPayment>(`/application-payments/${id}/mismatch`, { reason });

/* ------------------------------------------------------------------ *
 * GET /auth/me/access — cosmetic sidebar / filter gating.
 * ------------------------------------------------------------------ */

export type AccessScope = "all" | "owners" | "stages" | "none";

export interface MeAccess {
  role_key: string | null;
  scope: AccessScope;
  owner_ids_count: number | null;
  stages: string[] | null;
}

export function getMyAccess() {
  return apiGet<MeAccess>("/auth/me/access");
}

/* ------------------------------------------------------------------ *
 * File helpers.
 * ------------------------------------------------------------------ */

/** Object URL for an auth-gated payment proof. Caller revokes it. */
export function paymentProofUrl(paymentId: number): Promise<string> {
  return apiFileBlobUrl(`/application-payments/${paymentId}/proof`);
}

// Application documents are streamed through the scoped, record-access-guarded
// endpoint GET /applications/:id/documents/:docId/file — see
// applicationDocumentFileUrl in ./application-form.ts.

/* ------------------------------------------------------------------ *
 * Small value helpers shared by the workflow screens.
 * ------------------------------------------------------------------ */

export function toNumber(value: Money): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatINR(value: Money): string {
  const n = toNumber(value);
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Shared TanStack Query keys so every mutation invalidates the same entries. */
export const applicationKeys = {
  detail: (id: number) => ["application", "detail", id] as const,
  timeline: (id: number) => ["application", "timeline", id] as const,
  documents: (id: number) => ["application", "documents", id] as const,
  payments: (id: number) => ["application", "payments", id] as const,
  list: ["applications", "list"] as const,
  queue: ["application-payments", "queue"] as const,
};
