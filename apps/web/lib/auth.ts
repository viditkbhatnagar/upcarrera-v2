/**
 * Auth session helpers (client-side).
 *
 * On login we persist two things:
 *   - the JWT in the `uc_token` cookie (read by `lib/api.ts` AND by `middleware.ts`)
 *   - the user snapshot in localStorage (so the Topbar can show the name without a round-trip)
 */

import { apiLogin } from "./api";
import {
  deleteCookie,
  getCookie,
  setCookie,
  TOKEN_COOKIE,
  USER_STORAGE_KEY,
} from "./cookies";
import type { AuthUser, LoginResult } from "./types";

/** Log in, persist the token + user snapshot, and return the result. */
export async function login(
  username: string,
  password: string,
): Promise<LoginResult> {
  const result = await apiLogin(username, password);
  setCookie(TOKEN_COOKIE, result.auth_token);
  const { auth_token: _authToken, ...user } = result;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
  return result;
}

/** Clear the token + cached user. */
export function logout(): void {
  deleteCookie(TOKEN_COOKIE);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(USER_STORAGE_KEY);
  }
}

/** Current JWT, or null if not logged in. */
export function getToken(): string | null {
  return getCookie(TOKEN_COOKIE);
}

/** The cached user snapshot, or null. Reads from localStorage; falls back to the JWT payload. */
export function getCurrentUser(): AuthUser | null {
  if (typeof window === "undefined") return null;

  const cached = window.localStorage.getItem(USER_STORAGE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as AuthUser;
    } catch {
      // fall through to JWT decode
    }
  }

  // Fallback: decode the user snapshot embedded in the JWT payload (`{ sub, data }`).
  const token = getToken();
  if (!token) return null;
  try {
    const payloadB64 = token.split(".")[1];
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { data?: AuthUser };
    return payload.data ?? null;
  } catch {
    return null;
  }
}
