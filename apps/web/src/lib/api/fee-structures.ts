// Typed client for the WS2 Fee Structure master endpoints. Unwraps the standard
// { status, message, data } envelope via the shared api helpers.
import { apiDelete, apiFileBlobUrl, apiGet, apiPatch, apiPost } from "@/lib/api";

export type FeeStatus = "draft" | "active" | "expired";
export type FeeCollectionModel = "upcarrera_collects" | "university_collects";
export type IntakeStatus = "Upcoming" | "Open" | "Closed" | "Unknown";
export type CourseFeeBasis = "total" | "per_year" | "per_semester";
export type ComponentBasis = "one_time" | "per_year" | "per_semester";

export const FEE_STATUSES: FeeStatus[] = ["draft", "active", "expired"];
export const COURSE_FEE_BASES: CourseFeeBasis[] = ["total", "per_year", "per_semester"];
export const COMPONENT_BASES: ComponentBasis[] = ["one_time", "per_year", "per_semester"];

export const STATUS_LABEL: Record<FeeStatus, string> = {
  draft: "Draft",
  active: "Active",
  expired: "Expired",
};

export const COLLECTION_MODEL_LABEL: Record<FeeCollectionModel, string> = {
  upcarrera_collects: "upCarrera collects",
  university_collects: "University collects",
};

export const COLLECTION_MODEL_HELP: Record<FeeCollectionModel, string> = {
  upcarrera_collects:
    "The student pays upCarrera, which pays the university a royalty.",
  university_collects:
    "The student pays the university, which pays upCarrera a commission.",
};

export const BASIS_LABEL: Record<string, string> = {
  total: "Total",
  per_year: "Per year",
  per_semester: "Per semester",
  one_time: "One time",
};

export interface FeeStructureListItem {
  id: number;
  code: string | null;
  status: FeeStatus;
  currency: string;
  university_id: number;
  university_title: string | null;
  fee_collection_model: FeeCollectionModel | null;
  course_id: number;
  course_title: string | null;
  intake_id: number;
  intake_name: string | null;
  intake_start_date: string | null;
  intake_closing_date: string | null;
  intake_status: IntakeStatus;
  registration_fee: number | null;
  course_fee_basis: CourseFeeBasis | null;
  course_fee_amount: number | null;
  course_fee_periods: number | null;
  course_fee_total: number | null;
  exam_fee: number | null;
  exam_fee_basis: ComponentBasis | null;
  other_fees_total: number | null;
  total_fee: number | null;
  discount_allowed: boolean;
  discount_max_pct: number | null;
  allow_full: boolean;
  allow_per_year: boolean;
  allow_per_semester: boolean;
  allow_custom: boolean;
  copied_from_id: number | null;
  copied_from_code: string | null;
  activated_at: string | null;
  expired_at: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Per-row activation check (LOW-9): lets the list disable an un-activatable Activate. */
  activation: FeeActivation;
}

export interface FeeStructureCounts {
  draft: number;
  active: number;
  expired: number;
}

export interface FeeStructureListResponse {
  items: FeeStructureListItem[];
  total: number;
  page: number;
  limit: number;
  counts: FeeStructureCounts;
}

export interface FeeStructureItemRow {
  id: number;
  fee_type_id: number | null;
  label: string;
  amount: number | null;
  basis: ComponentBasis;
  sort_order: number;
}

export interface FeeStructureInstalmentRow {
  id: number;
  seq: number;
  label: string | null;
  amount: number | null;
  due_offset_days: number;
}

export interface FeeBreakdownLine {
  key: string;
  label: string;
  basis: string;
  unit: number;
  multiplier: number;
  total: number;
}

export interface FeeComputed {
  course_fee_total: number;
  exam_fee_total: number;
  other_fees_total: number;
  total_fee: number;
  max_discount: number;
  net_after_max_discount: number;
  custom_instalment_sum: number;
  custom_instalment_sum_label: string;
  total_fee_label: string;
}

export interface FeeActivation {
  ok: boolean;
  reasons: string[];
}

export interface FeeStructureDetail extends FeeStructureListItem {
  items: FeeStructureItemRow[];
  instalments: FeeStructureInstalmentRow[];
  breakdown: FeeBreakdownLine[];
  computed: FeeComputed;
  // `activation` is inherited from FeeStructureListItem.
}

export interface FeeStructureResolved {
  id: number;
  code: string | null;
  registration_fee: number | null;
  total_fee: number | null;
  currency: string;
  fee_collection_model: FeeCollectionModel | null;
}

export interface ListFeeStructuresParams {
  q?: string;
  university_id?: number;
  course_id?: number;
  intake_id?: number;
  status?: FeeStatus;
  fee_collection_model?: FeeCollectionModel;
  fee_min?: number;
  fee_max?: number;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface FeeItemInput {
  label: string;
  amount: number;
  basis: ComponentBasis;
  fee_type_id?: number;
  sort_order?: number;
}

export interface FeeInstalmentInput {
  seq: number;
  label?: string;
  amount: number;
  due_offset_days: number;
}

export interface CreateFeeStructurePayload {
  university_id: number;
  course_id: number;
  intake_id: number;
  currency?: string;
  registration_fee?: number;
  course_fee_basis?: CourseFeeBasis;
  course_fee_amount?: number;
  course_fee_periods?: number;
  exam_fee?: number;
  exam_fee_basis?: ComponentBasis;
  discount_allowed?: boolean;
  discount_max_pct?: number;
  allow_full?: boolean;
  allow_per_year?: boolean;
  allow_per_semester?: boolean;
  allow_custom?: boolean;
  notes?: string;
  items?: FeeItemInput[];
  instalments?: FeeInstalmentInput[];
}

export type UpdateFeeStructurePayload = Partial<Omit<CreateFeeStructurePayload, "university_id" | "course_id" | "intake_id">> & {
  change_reason?: string;
};

export interface CopyIntakeResult {
  created: number;
  skipped: Array<{
    university_id: number;
    university: string | null;
    course_id: number;
    course: string | null;
    reason: string;
  }>;
}

export const feeStructureKeys = {
  all: ["fee-structures"] as const,
  list: (params: ListFeeStructuresParams) => ["fee-structures", "list", params] as const,
  detail: (id: number | string) => ["fee-structures", "detail", String(id)] as const,
};

/** Strip undefined / empty values so the query string stays clean. */
function cleanParams(params: ListFeeStructuresParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") out[key] = value as string | number;
  }
  return out;
}

export function listFeeStructures(params: ListFeeStructuresParams): Promise<FeeStructureListResponse> {
  return apiGet<FeeStructureListResponse>("/fee-structures", cleanParams(params));
}

export function getFeeStructure(id: number | string): Promise<FeeStructureDetail> {
  return apiGet<FeeStructureDetail>(`/fee-structures/${id}`);
}

export function createFeeStructure(body: CreateFeeStructurePayload): Promise<FeeStructureDetail> {
  return apiPost<FeeStructureDetail>("/fee-structures", body);
}

export function updateFeeStructure(
  id: number | string,
  body: UpdateFeeStructurePayload,
): Promise<FeeStructureDetail> {
  return apiPatch<FeeStructureDetail>(`/fee-structures/${id}`, body);
}

export function deleteFeeStructure(id: number | string): Promise<{ id: number; deleted: boolean }> {
  return apiDelete<{ id: number; deleted: boolean }>(`/fee-structures/${id}`);
}

export function activateFeeStructure(id: number | string): Promise<FeeStructureDetail> {
  return apiPost<FeeStructureDetail>(`/fee-structures/${id}/activate`, {});
}

export function expireFeeStructure(id: number | string, reason?: string): Promise<FeeStructureDetail> {
  return apiPost<FeeStructureDetail>(`/fee-structures/${id}/expire`, reason ? { reason } : {});
}

export function copyFeeStructure(
  id: number | string,
  intakeId?: number,
): Promise<FeeStructureDetail> {
  return apiPost<FeeStructureDetail>(
    `/fee-structures/${id}/copy`,
    intakeId ? { intake_id: intakeId } : {},
  );
}

export function copyIntake(body: {
  from_intake_id: number;
  to_intake_id: number;
  university_id?: number;
}): Promise<CopyIntakeResult> {
  return apiPost<CopyIntakeResult>("/fee-structures/copy-intake", body);
}

/** Fetch the CSV export (auth-gated) and trigger a browser download. */
export async function downloadFeeStructuresCsv(params: ListFeeStructuresParams): Promise<void> {
  const url = await apiFileBlobUrl("/fee-structures/export", cleanParams(params));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "fee-structures.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** The v2 intake master (GET /intakes) — the dated schedule fee structures key on. */
export interface IntakeOption {
  id: number;
  name: string | null;
  start_date: string | null;
  closing_date: string | null;
}

export function listIntakes(): Promise<{ items: IntakeOption[] }> {
  return apiGet<{ items: IntakeOption[] }>("/intakes", { limit: 500 });
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** "₹1,23,456.78" for any rupee amount; em dash for null. */
export function formatInr(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return INR.format(amount);
}
