// Auth flow on top of the API client + session storage.
import { apiPost } from "./api";
import { setSession, clearSession, type SessionUser } from "./session";

interface LoginResponse extends SessionUser {
  auth_token: string;
}

/**
 * POST /api/auth/login. The "email / user ID" field maps to the backend
 * `username` (auth.service.login resolves by username). On success the JWT +
 * user snapshot are persisted to the session.
 */
export async function login(usernameOrEmail: string, password: string): Promise<SessionUser> {
  const data = await apiPost<LoginResponse>("/auth/login", {
    username: usernameOrEmail,
    password,
  });
  const { auth_token, ...user } = data;
  setSession(auth_token, user);
  return user;
}

export function logout(): void {
  clearSession();
}

/**
 * Step 1 of self-serve recovery: POST /api/public/auth/forgot-password. Resolves
 * the same way whether or not the account exists (no enumeration) — the caller
 * always advances to the code-entry step.
 */
export async function requestPasswordReset(identifier: string): Promise<void> {
  await apiPost("/public/auth/forgot-password", { identifier });
}

/**
 * Step 2: POST /api/public/auth/reset-password. Throws ApiError with a generic
 * message if the code is wrong/expired (also no enumeration).
 */
export async function resetPasswordWithOtp(
  identifier: string,
  otp: string,
  password: string,
): Promise<void> {
  await apiPost("/public/auth/reset-password", { identifier, otp, password });
}
