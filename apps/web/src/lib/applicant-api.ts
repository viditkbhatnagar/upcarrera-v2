// Dedicated fetch client for the PUBLIC applicant form. It is intentionally NOT
// lib/api.ts: it never sends the staff Bearer token and never redirects to /login.
// It sends X-Applicant-Session, unwraps the same { status, message, data, code }
// envelope, and on a dead session (401/410) dispatches a window event the route
// turns into the right status screen.
import {
  clearApplicantSession,
  getApplicantToken,
  setApplicantSession,
} from "./applicant-session";

const BASE_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000/api").replace(
    /\/$/,
    "",
  );

export const LINK_DEAD_EVENT = "applicant-link-dead";

export type LinkDeadCode =
  | "LINK_INVALID"
  | "LINK_EXPIRED"
  | "LINK_REPLACED"
  | "ALREADY_SUBMITTED"
  | "SESSION_ENDED";

export class ApplicantApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;
  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.name = "ApplicantApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

interface Envelope<T> {
  status: boolean;
  message: string;
  data: T;
  code?: string;
}

function dispatchLinkDead(code: LinkDeadCode, data?: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LINK_DEAD_EVENT, { detail: { code, data } }));
}

async function parse<T>(res: Response): Promise<Envelope<T> | null> {
  try {
    return (await res.json()) as Envelope<T>;
  } catch {
    return null;
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE";

async function request<T>(
  path: string,
  options: { method?: Method; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.auth !== false) {
    const token = getApplicantToken();
    if (token) headers["X-Applicant-Session"] = token;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApplicantApiError("We couldn't reach the server. Check your connection.", 0);
  }

  const payload = await parse<T>(res);

  if (res.status === 401 || res.status === 410) {
    const code = (payload?.code as LinkDeadCode) ?? (res.status === 410 ? "LINK_EXPIRED" : "SESSION_ENDED");
    dispatchLinkDead(code, payload?.data);
    throw new ApplicantApiError(payload?.message ?? "Your session has ended.", res.status, code, payload?.data);
  }

  if (!res.ok || !payload || payload.status === false) {
    throw new ApplicantApiError(
      payload?.message ?? `Request failed (${res.status})`,
      res.status,
      payload?.code,
      payload?.data,
    );
  }
  return payload.data;
}

/* ------------------------------------------------------------------ *
 * Shapes (mirror apps/api ApplicationFormService.buildView + saves)
 * ------------------------------------------------------------------ */

export interface ProgressStep {
  key: string;
  label: string;
  complete: boolean;
}
export interface Progress {
  completed: number;
  total: number;
  steps: ProgressStep[];
}
export interface EligibilityView {
  status: "eligible" | "not_eligible" | "needs_review" | null;
  detail: string | null;
}
export interface DocFile {
  id: number;
  label: string | null;
  original_name: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  verification_status?: string;
}
export interface ChecklistItem {
  requirement_id: number;
  label: string;
  is_required: boolean;
  max_files: number;
  help_text: string | null;
  files: DocFile[];
}
export interface PersonalValues {
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
export interface ContactValues {
  email: string | null;
  phone: string | null;
  second_phone: string | null;
  whatsapp_no: string | null;
  address: string | null;
  state: string | null;
  district: string | null;
  pin_code: string | null;
}
export interface EducationRecord {
  id?: number;
  level_code: string | null;
  label: string | null;
  institution: string | null;
  board: string | null;
  passing_year: number | null;
  score_type: string | null;
  score_value: number | null;
  score_scale: number | null;
}
export interface EmploymentValues {
  employment_status: string | null;
  total_experience_months: number | null;
  current_employer: string | null;
  current_designation: string | null;
  employment_history: Array<Record<string, string>>;
}
export interface ApplicationView {
  application_id: string;
  program: { university: string | null; course: string | null; specialisation: string | null; intake: string | null };
  counsellor: { name: string | null; email: string | null; phone: string | null };
  sections: {
    personal: PersonalValues;
    contact: ContactValues;
    education: { highest_qualification: string | null; records: EducationRecord[] };
    employment: EmploymentValues | null;
  };
  employment_required: boolean;
  documents: { checklist: ChecklistItem[]; other: DocFile[] };
  eligibility: EligibilityView;
  program_change_request: string | null;
  reopen_reason: string | null;
  progress: Progress;
  row_version: number;
  link_expires_at: string | null;
}

export interface Option {
  value: string;
  label: string;
}
export interface Lookups {
  countries: Array<{ id: number; name: string }>;
  states: Array<{ id: number; name: string; country: string }>;
  categories: Option[];
  marital_statuses: Option[];
  qualification_levels: Option[];
  score_types: Option[];
  employment_statuses: Option[];
}

export interface SaveSectionResult {
  progress: Progress;
  eligibility: EligibilityView;
  row_version: number;
}
export interface ProgramResult {
  progress: Progress;
  row_version: number;
}
export interface SubmitResult {
  submitted: boolean;
  application_id: string;
  submitted_at: string;
}
export interface SessionResult {
  session: string;
  expires_at: string;
}

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

export async function exchangeToken(token: string): Promise<SessionResult> {
  const res = await request<SessionResult>("/public/application/session", {
    method: "POST",
    body: { token },
    auth: false,
  });
  setApplicantSession(res.session, res.expires_at);
  return res;
}

export async function refreshSession(): Promise<SessionResult> {
  const res = await request<SessionResult>("/public/application/session/refresh", { method: "POST", body: {} });
  setApplicantSession(res.session, res.expires_at);
  return res;
}

export const getApplication = () => request<ApplicationView>("/public/application");
export const getLookups = () => request<Lookups>("/public/application/lookups");

export const saveSection = (
  section: string,
  data: Record<string, unknown>,
  complete: boolean,
  rowVersion: number,
) =>
  request<SaveSectionResult>(`/public/application/sections/${section}`, {
    method: "PUT",
    body: { data, complete, row_version: rowVersion },
  });

export const confirmProgram = (rowVersion: number, changeRequest?: string) =>
  request<ProgramResult>("/public/application/program/confirm", {
    method: "POST",
    body: { row_version: rowVersion, ...(changeRequest ? { change_request: changeRequest } : {}) },
  });

export const deleteDocument = (docId: number) =>
  request<{ deleted: boolean; progress: Progress }>(`/public/application/documents/${docId}`, { method: "DELETE" });

export const submitApplication = (rowVersion: number) =>
  request<SubmitResult>("/public/application/submit", {
    method: "POST",
    body: { accept_accuracy: true, accept_terms: true, row_version: rowVersion },
  });

/** Upload a document with progress via XMLHttpRequest (fetch has no upload progress). */
export function uploadDocument(
  file: File,
  requirementId: number,
  onProgress?: (percent: number) => void,
): Promise<{ document: DocFile; progress: Progress }> {
  return new Promise((resolve, reject) => {
    const token = getApplicantToken();
    const form = new FormData();
    form.append("file", file);
    form.append("requirement_id", String(requirementId));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/public/application/documents`);
    if (token) xhr.setRequestHeader("X-Applicant-Session", token);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: Envelope<{ document: DocFile; progress: Progress }> | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status === 401 || xhr.status === 410) {
        const code = (body?.code as LinkDeadCode) ?? "SESSION_ENDED";
        dispatchLinkDead(code);
        reject(new ApplicantApiError(body?.message ?? "Your session has ended.", xhr.status, code));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.status) {
        resolve(body.data);
      } else {
        reject(new ApplicantApiError(body?.message ?? `Upload failed (${xhr.status})`, xhr.status, body?.code));
      }
    };
    xhr.onerror = () => reject(new ApplicantApiError("Upload failed. Check your connection.", 0));
    xhr.send(form);
  });
}

/** Fetch an own-document preview as a blob URL (sends the session header). */
export async function documentBlobUrl(docId: number): Promise<string> {
  const token = getApplicantToken();
  const res = await fetch(`${BASE_URL}/public/application/documents/${docId}/file`, {
    headers: token ? { "X-Applicant-Session": token } : {},
  });
  if (!res.ok) throw new ApplicantApiError(`Failed to load file (${res.status})`, res.status);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export { clearApplicantSession };
