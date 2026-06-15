/**
 * API client for the NestJS backend.
 *
 * Every endpoint returns the legacy envelope `{ status, message, data }`. These helpers
 * unwrap it: on `status: false` (or a non-2xx response) they throw an `ApiError` carrying
 * the API's `message`; otherwise they return the bare `data` payload.
 *
 * The JWT is read from the `uc_token` cookie and sent as `Authorization: Bearer <token>`.
 */

import { getCookie, TOKEN_COOKIE } from "./cookies";
import type { ApiEnvelope, LoginResult } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

/** Error thrown when the API returns `status: false` or a non-2xx status. */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

type QueryValue = string | number | boolean | undefined | null;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const base = `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function authHeaders(includeJson: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  const token = getCookie(TOKEN_COOKIE);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** Parse the envelope, throwing `ApiError` on failure. Returns the bare `data`. */
async function handleResponse<T>(res: Response): Promise<T> {
  let envelope: Partial<ApiEnvelope<T>> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    // Body was empty or not JSON.
  }

  if (!res.ok || envelope?.status === false) {
    const message =
      envelope?.message ||
      (res.status === 401
        ? "Your session has expired. Please log in again."
        : `Request failed (${res.status})`);
    throw new ApiError(message, res.status);
  }

  return (envelope?.data ?? null) as T;
}

/** GET a resource. Optionally pass query params (e.g. `{ page, limit }`). */
export async function apiGet<T>(
  path: string,
  query?: Record<string, QueryValue>,
): Promise<T> {
  const res = await fetch(buildUrl(path, query), {
    method: "GET",
    headers: authHeaders(false),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

/** POST a JSON body to a resource. */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: authHeaders(true),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

/** PATCH a JSON body to a resource. */
export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "PATCH",
    headers: authHeaders(true),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

/** DELETE a resource. */
export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "DELETE",
    headers: authHeaders(false),
    cache: "no-store",
  });
  return handleResponse<T>(res);
}

/**
 * Authenticate against POST /auth/login.
 * Returns the user snapshot + `auth_token`. Does NOT persist anything — callers
 * (see `lib/auth.ts`) decide where to store the token.
 */
export async function apiLogin(
  username: string,
  password: string,
): Promise<LoginResult> {
  // This endpoint is @Public — no Authorization header is sent.
  const res = await fetch(buildUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });
  return handleResponse<LoginResult>(res);
}

export { API_URL };
