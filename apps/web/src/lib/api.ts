// Typed client for the NestJS API. Unwraps the global { status, message, data }
// envelope (ResponseInterceptor) and throws ApiError on failure so callers /
// TanStack Query can surface a clean message.
import { getToken, clearSession } from "./session";

// Same-origin "/api" in production (web + api behind one nginx); localhost in dev.
const BASE_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3000/api").replace(
    /\/$/,
    "",
  );

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface Envelope<T> {
  status: boolean;
  message: string;
  data: T;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  // 401 -> token missing/expired: drop the session and bounce to login once.
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    throw new ApiError("Your session has expired. Please log in again.", 401);
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await res.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || payload.status === false) {
    throw new ApiError(payload?.message ?? `Request failed (${res.status})`, res.status);
  }

  return payload.data;
}

export const apiGet = <T = unknown>(path: string, query?: RequestOptions["query"]) =>
  request<T>(path, { query });
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body });
export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
  request<T>(path, { method: "PATCH", body });
export const apiPut = <T = unknown>(path: string, body?: unknown) =>
  request<T>(path, { method: "PUT", body });
export const apiDelete = <T = unknown>(path: string) => request<T>(path, { method: "DELETE" });

/**
 * Multipart upload (FormData). Sends the Bearer token but lets the browser set
 * the multipart Content-Type/boundary. Unwraps the same {status,message,data}
 * envelope as request().
 */
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path), { method: "POST", headers, body: formData });
  if (res.status === 401) {
    clearSession();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    throw new ApiError("Your session has expired. Please log in again.", 401);
  }
  let payload: Envelope<T> | null = null;
  try {
    payload = (await res.json()) as Envelope<T>;
  } catch {
    payload = null;
  }
  if (!res.ok || !payload || payload.status === false) {
    throw new ApiError(payload?.message ?? `Upload failed (${res.status})`, res.status);
  }
  return payload.data;
}

/**
 * Fetch an auth-gated binary (e.g. GET /files/serve) with the Bearer token and
 * return an object URL usable as an <img> src. The caller owns the URL and
 * should URL.revokeObjectURL() it when no longer needed.
 */
export async function apiFileBlobUrl(
  path: string,
  query?: RequestOptions["query"],
): Promise<string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, query), { headers });
  if (!res.ok) throw new ApiError(`Failed to load file (${res.status})`, res.status);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
