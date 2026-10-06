// Staff client for the WS5 magic-link + application-form endpoints. Uses the
// shared staff api helpers (Bearer token + { status, message, data } envelope).
import { apiDelete, apiGet, apiPost } from "@/lib/api";

export interface ProgressStep {
  key: string;
  label: string;
  complete: boolean;
}
export interface FormProgress {
  completed: number;
  total: number;
  steps: ProgressStep[];
}

export interface ActiveLink {
  link_id: number;
  purpose: string;
  sent_to: string | null;
  email_status: string | null;
  expires_at: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
}

export interface LinkHistoryItem {
  link_id: number;
  purpose: string;
  email_status: string | null;
  sent_to: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  open_count: number;
  last_opened_at: string | null;
}

export interface MagicLinkStatus {
  active: ActiveLink | null;
  history: LinkHistoryItem[];
  progress: FormProgress;
  last_submitted_at: string | null;
}

export interface IssueLinkResult {
  link_id: number;
  expires_at: string;
  sent_to: string | null;
  email_status: string;
}

export const getMagicLinkStatus = (id: number) =>
  apiGet<MagicLinkStatus>(`/applications/${id}/magic-link`);

export const issueMagicLink = (id: number, resend = false) =>
  apiPost<IssueLinkResult>(`/applications/${id}/magic-link`, resend ? { resend: true } : {});

export const revokeMagicLink = (id: number) =>
  apiDelete<{ revoked: number }>(`/applications/${id}/magic-link`);

export const reopenForm = (id: number, reason: string) =>
  apiPost<{ reopened: boolean; link_id: number; expires_at: string }>(
    `/applications/${id}/form/reopen`,
    { reason },
  );

export const magicLinkKeys = {
  status: (id: number) => ["application", "magic-link", id] as const,
};
