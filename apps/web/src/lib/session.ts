// Low-level session storage (token + cached user snapshot). Kept dependency-free
// so both the API client (api.ts) and the auth flow (auth.ts) can import it
// without a circular dependency.

const TOKEN_KEY = "uc_token";
const USER_KEY = "uc_user";

export interface SessionUser {
  id: number;
  role_id: number | null;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  profile_picture: string | null;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
