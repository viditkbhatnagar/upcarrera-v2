/**
 * Minimal client-side cookie helpers.
 *
 * The JWT lives in a plain (non-httpOnly) cookie so client components can read it
 * to attach the Authorization header. This is acceptable for an internal staff tool.
 *
 * TODO (hardening): move to an httpOnly cookie set by a Next.js route handler and
 * proxy API calls server-side, so the token is never exposed to client JS (mitigates XSS
 * token theft).
 */

export const TOKEN_COOKIE = "uc_token";
export const USER_STORAGE_KEY = "uc_user";

const TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days — mirrors API JWT_EXPIRES_IN.

export function setCookie(
  name: string,
  value: string,
  maxAgeSeconds: number = TOKEN_MAX_AGE_SECONDS,
): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
}

export function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}
