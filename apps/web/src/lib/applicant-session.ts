// Per-viewer storage for the APPLICANT session, kept entirely separate from the
// staff "uc_token". Uses sessionStorage so closing the tab ends the session, and
// stores ONLY the opaque JWT + its expiry — never any PII. Every access is wrapped
// in try/catch because sessionStorage can throw in private windows.

const KEY = "uc_applicant_session";

export interface ApplicantSession {
  session: string;
  /** ISO timestamp the session JWT expires at. */
  expiresAt: string;
}

export function getApplicantSession(): ApplicantSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApplicantSession;
    if (!parsed?.session || !parsed?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getApplicantToken(): string | null {
  return getApplicantSession()?.session ?? null;
}

export function setApplicantSession(session: string, expiresAt: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ session, expiresAt } satisfies ApplicantSession));
  } catch {
    /* storage unavailable — the session lives only in memory for this page */
  }
}

export function clearApplicantSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
